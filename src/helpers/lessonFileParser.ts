// Helper file for handling the reading and parsing of Strype Lesson Files.
// Takes an uploaded text file as input, handled by the Lesson Selection Component.
// Splits the file into 'tokens' which are handled by lessonFileTokenEvaluater.ts to build a LessonParseResult object.

// Since it takes the file as a parameter and returns the steps information to the component, no store connection is needed.

import { evaluateEndOfFile, evaluateInitialLessonFile, evaluateTagToken, evaluateTextToken } from "./lessonFileTokenEvaluater";
import { LessonStepDetails, StepPanelType, LessonParseResult, LessonMetadata, LessonParseNestSection } from "@/types/types";

// Some constants that affect multiple parts of the parser, in case they need to be tweaked.
// For an explanation of each option, see the initialization of it below
export interface LessonParserConfiguration {
    PLACEHOLDER_TEXT: string,

    CONTINUE_FROM_CLOSER_TYPO: boolean,
    CONTINUE_FROM_MISSING_CLOSER: boolean,
    //CONTINUE_FROM_MAX_STEPS: boolean,

    ALLOW_ATTRIBUTES_IN_STEP_NEST: boolean,
    ALLOW_HINTS_IN_STEP_NEST: boolean,
    ALLOW_METADATA_IN_ROOT: boolean,
    ALLOW_MULTIPLE_METADATA_SECTIONS: boolean,
    ALLOW_MULTIPLE_STEP_SUBSECTIONS: boolean,
    ALLOW_REQUIREMENTS_ABOVE_MAX_VALUES: boolean,
    ALLOW_REQUIREMENTS_IN_STEP_NEST: boolean,
    
    MAX_HINTS_PER_STEP: number,
    MAX_LESSON_STEPS: number,
    MIN_LESSON_STEPS: number,
    MAX_LENGTH_CONSOLE_OUTPUT: number,
    MAX_LENGTH_DESCRIPTION: number,
    MAX_LENGTH_HAS_PYTHON: number,
    MAX_LENGTH_HINT_TEXT: number,
    MAX_LENGTH_STEPREF: number,
    MAX_LENGTH_STEP_TEXT: number,
    MAX_LENGTH_TITLE: number,
    MAX_REQ_ARG_FAILED_ATTEMPTS: number,
    MAX_REQ_ARG_TIME_PASSED: number,
    MAX_REQUIREMENTS_PER_HINT: number,
    MAX_REQUIREMENTS_PER_STEP:  number,

    LESSON_FILE_SUFFIX: string,
    MAX_FILE_LINES: number,
    MAX_FILE_SIZE_BYTES: number,
    MAX_INITIAL_PYTHON_SIZE_BYTES: number,

    DEBUG_LOG_END_RESULTS: boolean,
    DEBUG_LOG_TOKENS: boolean,
}

// Parser Configuration Settings - affects how the parser behaves towards certain error cases.
const parserConfig: LessonParserConfiguration = {
    // Placeholder text - a text string that uses multiple spaces to ensure it cannot be replicated by the Lesson File programmer (since parser removes duplicate spaces).
    PLACEHOLDER_TEXT: "PLACEHOLDER   TEXT",
    
    // 'Continues' - affects whether the parser tries to workaround some error cases to continue debugging the rest of the Lesson file (throws ERROR instead of FATAL ERROR, still disallowing running the file to be safe)
    CONTINUE_FROM_CLOSER_TYPO: true,            // Whether the parser should work around likely mistyped closer tags that are missing '/' (e.g. <attributes><panel-type bar><attributes>)
    CONTINUE_FROM_MISSING_CLOSER: true,         // Whether the parser should ignore missing closing tags and work around them. Maybe risky as it is not always picked up (e.g. text segments)
    //CONTINUE_FROM_MAX_STEPS: false,           // Whether the parser should continue checking the file past the step limit. Seems useless if the user will need to remove them anyway + size limit risks.
    
    // 'Allows' - affects whether the parser permits some coding choices by the Lesson File programmer. Any case set to 'true' usually converts an ERROR to a suggestion/warning
    ALLOW_ATTRIBUTES_IN_STEP_NEST: true,        // Whether Attribute tags can be placed inside Steps without needing an <attributes> section. Putting 'false' enforces code better code organisation.
    ALLOW_HINTS_IN_STEP_NEST: true,             // Whether Hints can be placed inside Steps without needing a <hint-list> section. If 'true', it only gives a suggestion with more than one hint.
    ALLOW_METADATA_IN_ROOT: false,              // Whether Metadata sections can be placed unnested (in root). Putting 'false' enforces better code organisation.
    ALLOW_MULTIPLE_METADATA_SECTIONS: true,     // Whether a Lesson File can contain more than one <metadata> section. Best practice is only one section at the top.
    ALLOW_MULTIPLE_STEP_SUBSECTIONS: false,     // Whether Steps can have duplicate subsections. An example is a Step with two <attributes> sections. Harder to detect duplicate contents when 'true'.
    ALLOW_REQUIREMENTS_ABOVE_MAX_VALUES: true,  // Whether Requirement tags with number values can go beyond their recommended limits. Putting 'true' just leaves a suggestion instead.
    ALLOW_REQUIREMENTS_IN_STEP_NEST: true,      // Whether Requirement tags can be placed inside Steps without needing an <requirements> section. Steps usually have only 0-1 requirements anyway so should be fine.
  
    // Number values, mainly for min/max's to enforce limits to inputted data
    MAX_HINTS_PER_STEP: 4,                      // Maximum amount of hints that one step can have.
    MAX_LESSON_STEPS: 40,                       // Maximum steps in one lesson file. Current graphics start to break at 42+ steps, so this is a good number to settle on.
    MIN_LESSON_STEPS: 2,                        // MINIMUM amount of steps for a valid lesson file.
    MAX_LENGTH_CONSOLE_OUTPUT: 200,             // Maximum character length for <console-output> section.
    MAX_LENGTH_DESCRIPTION: 400,                // Maximum character length for the Lesson description.
    MAX_LENGTH_HAS_PYTHON: 200,                 // Maximum character length for <has-python> section.
    MAX_LENGTH_HINT_TEXT: 200,                  // Maximum character length for <text> section inside a Hint.
    MAX_LENGTH_STEPREF: 30,                     // Maximum character length for each stepRef.
    MAX_LENGTH_STEP_TEXT: 800,                  // Maximum character length for text in a Step. Note that this limit is much higher than a Step Panel can display without a scrollbar.
    MAX_LENGTH_TITLE: 100,                      // Maximum character length for the Lesson title.
    MAX_REQ_ARG_FAILED_ATTEMPTS: 8,             // Maximum argument value for <failed-attempts N> Requirement for hints. 
    MAX_REQ_ARG_TIME_PASSED: 300,               // Maximum argument value for <time-passed N> Requirement, where N is in seconds.
    MAX_REQUIREMENTS_PER_HINT: 4,               // Maximum amount of requirements that one HINT can have. Needs to be lower for memory usage limitations.
    MAX_REQUIREMENTS_PER_STEP: 10,              // Maximum amount of requirements that one STEP can have.

    // Lesson File specific details
    LESSON_FILE_SUFFIX: ".spyl",                // The file type used for Lesson Files, affecting downloads and uploads where necessary.
    MAX_FILE_LINES: 2000,                       // Maximum lines that a valid lesson file can contain. Assumes upper bound of ~20 lines per Step + extra for initial file + padding to be safe.
    MAX_FILE_SIZE_BYTES: 102400,                // Note: this is WAY larger than the Line and Step restrictions. This more avoids invalid file types from being uploaded.
    MAX_INITIAL_PYTHON_SIZE_BYTES: 20480,       // Maximum character length for the Initial Python File section. Lessons should be starting on small projects anyway.

    // Debug switches, logging elements of the parser in the console if required
    DEBUG_LOG_END_RESULTS: false,               // Log the final results for a parsed lesson file.
    DEBUG_LOG_TOKENS: false,                    // Log individual tokens as they are scanned.
};

// Allows the config to be accessed by documentation for automatically updating values
export function getParserConfig(): LessonParserConfiguration {
    return parserConfig;
}

// Takes a string array as a parameter, being the uploaded lesson file split into individual lines (better for debug messages).
export function parseFullLessonFile(sourceLines: string[]) : LessonParseResult {
    // Lesson Detail object
    const lessonDetails: LessonMetadata = {
        title: parserConfig.PLACEHOLDER_TEXT,
        description: parserConfig.PLACEHOLDER_TEXT,
        totalSteps: 0,
    };

    // Main interface to return
    const parseResult: LessonParseResult = {
        success: true, // Terminates early when this is set to false
        steps: [],
        details: lessonDetails,
        debugMessages: [],
    };

    /* Lesson File Syntax makes use of "nested" sections. For example:
     * <step>                   +Nest Level 1 "step"
     * ...
     *      <attributes>        +Nest Level 2 "attributes"
     *      ...
     *      </attributes>       -Nest Level 2
     *      <requirements>      +Nest Level 2 "requirements"
     *      ...
     *      </requirements>     -Nest Level 2
     * </step>                  -Nest Level 1
     */
    const currentNestLevels: LessonParseNestSection[] = [{nestLevel: "root", contents: []}]; // Acts as a stack to keep track of the current section being read.
    let currentNest = "root";
    // All sections that involve text, used to allow writing < and > without breaking the parser
    const nestLevelsWithValidText: string[] = 
        ["text", "text_inHint", "python-present", "python-present_inHint", "title", "description", "#", "initial-python-file"];

    // When building the parser logic, I had the choice of using a regular expression tokenizer or an individual character scanner.
    // Regex tokenizing would be more efficient, but could have problems regarding Python segments, stray < and > characters, missing spaces, and potentially more.
    // Since there is a size limit for the inputted lesson file, this uses a character scanner as a DFA.

    let currentWord = "";
    let currentToken = ""; // Stores the current token (not word) as it is read and built. Can go across multiple lines. Some examples of tokens:
    // <step StepOne>       <-- Section opener Tag Token
    // </step>              <-- Section closer Tag Token
    // Hello world.         <-- Text Token
    // if(x > 1):           <-- Text Token
    // <panel-type bar>     <-- Data Tag Token
    let readingTextToken = false; // Used for logic that allows < and > to be written in text segments and python code without causing issues
    let firstLineOfTextToken = 0; // Stores the line that a text token begins on since they can span multiple lines. Used for more accurate debug messages.

    // Default step for each step to build off - note that this will be modified by the <default> section
    // Default values are labelled for each part in the documentation.
    const defaultStepTemplate: LessonStepDetails = {
        stepRef: parserConfig.PLACEHOLDER_TEXT,
        hints: [],
        requirements: [],

        attributes: {panelType: StepPanelType.LEFT_POPUP},
        textContent: parserConfig.PLACEHOLDER_TEXT,
    };

    // Checks file-specific maximums
    if(evaluateInitialLessonFile(sourceLines, parseResult, parserConfig)) {
        return parseResult; // Early return
    }

    // Main parsing loop
    for (let lineNum = 0; lineNum < sourceLines.length; lineNum++) {

        for (let charNum = 0; charNum < sourceLines[lineNum].length; charNum++) {
            // Could use for-each, but that prevents accessing nearby chars + detecting end of line
            const ch = sourceLines[lineNum][charNum];

            // Read through characters of each line
            if (ch == " " || ch == "<" || ch == ">" || (charNum + 1 == sourceLines[lineNum].length)) {
                // Cases for when to start a new word

                if(ch == ">" || (charNum + 1 == sourceLines[lineNum].length)) {
                    // Cases where this is the last character of the current word, so this character needs to be included
                    currentWord += ch;
                }

                // Add the word to the token
                if(currentToken != "" && currentToken[currentToken.length - 1] != " ") {
                    currentToken += " "; 
                    // Space between tokens to maintain consistency with source code
                    // Also converts multiple spaces into one
                }
                currentToken += currentWord;
                currentNest = currentNestLevels[currentNestLevels.length - 1].nestLevel;
                if(currentToken != "" && currentToken[0] != "<" && nestLevelsWithValidText.includes(currentNest)) {
                    if(!readingTextToken) { // Ensures that it is only stored when the text token is first detected
                        firstLineOfTextToken = lineNum;
                    }
                    readingTextToken = true;
                }

                // Some nest levels have a suffix to remember their parent nest, for example 'text_inHint'. 
                // As the actual tag token will only contain the first word, this uses a .split to remove the suffix so that the closer can be detected.
                const trueNest = currentNest.split("_")[0]; 
                
                if(trueNest == "initial-python-file" && lineNum + 1 < sourceLines.length && (sourceLines[lineNum].slice(charNum, charNum + 2 + trueNest.length) == ("</" + trueNest))) {
                    // Prevents the super-duper rare case where a programmer has written "</initial-python-file" in their python code and tried to make the parser teminate early
                }
                else if ((!readingTextToken && (ch == "<" || ch == ">")) ||                                     // If reading tag, look for < and >
                    (sourceLines[lineNum].slice(charNum, charNum + 2 + trueNest.length) == ("</" + trueNest))){ // If reading text, only look for respective closing tag


                    // Cases where a token should end, as a tag has either been reached or ended
                    if(isTokenValidTag(currentToken)) {
                        firstLineOfTextToken = lineNum; // Updates since it is no longer reading text
                        evaluateTagToken(
                            currentToken.replace("/>", ">"), //* see below
                            currentNestLevels, 
                            lineNum + 1, 
                            parseResult, 
                            defaultStepTemplate, 
                            parserConfig
                        );
                        // * In the code above, currentToken has one method applied:
                        // - .replaceAll() converts tags ending in /> to just >, allowing <tag> and <tag/> to be both allowed depending on user preference (<tag/> is common in other markups)
                    }
                    else {
                        evaluateTextToken(
                            currentToken.trim().replaceAll(/<#>[\s\S]*?<\/#>/g, ""), //* see below
                            currentNestLevels,
                            firstLineOfTextToken + 1, // More accurate debug messages when text covers multiple lines
                            parseResult, 
                            defaultStepTemplate, 
                            parserConfig
                        );
                        // * In the code above, currentToken has two methods applied:
                        // - .trim() removes all whitespace before and after which can be generated by indentations and linebreaks (shouldn't punish good coding practice)
                        // - .replaceAll() removes all content that is commented with the <#> tag. The regex finds substrings that start with <#> and end with </#>.
                    }
                    
                    currentToken = "";
                    readingTextToken = false;

                    if(!parseResult.success) { 
                        break; // Early termination from a fatal error
                    }  
                }

                // Reset the word, ensuring that < isn't lost (in cases like 'hello world</text>' where there is no space between end of token and text)
                if(ch == "<") {
                    currentWord = "<";
                }
                else {
                    currentWord = "";
                }
            }
            else {
                currentWord += ch;
                //console.log("Normal character, currentWord = " + currentWord);
            }
        }

        if(!parseResult.success) { 
            break; // Early termination from a fatal error
        }
    }

    // Run all final checks for the lesson file, assuming there hasn't already been a fatal error.
    if(parseResult.success) {
        evaluateEndOfFile(currentToken, currentNestLevels, sourceLines.length, parseResult, defaultStepTemplate, parserConfig);
    }
    parseResult.details.totalSteps = parseResult.steps.length; // Set total steps (displayed in lesson selection prior to parsing the file, so needs to be stored in metadata)
    
    // Debug messages
    if(parserConfig.DEBUG_LOG_END_RESULTS) {
        console.log("Suggestions:");
        for (let i = 0; i < parseResult.debugMessages.filter((m) => m.messageType == "suggestion").length; i++) {
            console.error("Line " + parseResult.debugMessages.filter((m) => m.messageType == "suggestion")[i].lineNum + " - " + parseResult.debugMessages.filter((m) => m.messageType == "suggestion")[i].debugMessageContent);
        }
        console.log("Warnings:");
        for (let i = 0; i < parseResult.debugMessages.filter((m) => m.messageType == "warning").length; i++) {
            console.error("Line " + parseResult.debugMessages.filter((m) => m.messageType == "warning")[i].lineNum + " - " + parseResult.debugMessages.filter((m) => m.messageType == "warning")[i].debugMessageContent);
        }
        console.log("Errors:");
        for (let i = 0; i < parseResult.debugMessages.filter((m) => m.messageType == "error").length; i++) {
            console.error("Line " + parseResult.debugMessages.filter((m) => m.messageType == "error")[i].lineNum + " - " + parseResult.debugMessages.filter((m) => m.messageType == "error")[i].debugMessageContent);
        }
        if (parseResult.debugMessages.some((m) => m.messageType == "fatal")) {
            console.error("Line " + parseResult.debugMessages.filter((m) => m.messageType == "fatal")[0].lineNum + " - " + parseResult.debugMessages.filter((m) => m.messageType == "fatal")[0].debugMessageContent);
        }
        console.log("All steps:");
        for (let i = 0; i < parseResult.steps.length; i++) {
            console.log(parseResult.steps[i].stepRef + " - " + parseResult.steps[i].textContent);
            console.log(parseResult.steps[i].requirements.length + " requirements, " + parseResult.steps[i].hints.length + " hints.");
        }
    }

    return parseResult;
}

// Private helper function that checks whether a token is a tag
function isTokenValidTag(token: string) {
    return (token[0] == "<" && token[token.length - 1] == ">");
}