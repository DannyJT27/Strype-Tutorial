// Helper file for handling the reading and parsing of Strype Lesson Files.
// Takes an uploaded text file as input, handled by the Lesson Selection Component.
// Splits the file into 'tokens' which are handled by lessonFileTokenEvaluater.ts to build a LessonParseResult object.

// Since it takes the file as a parameter and returns the steps information to the component, no store connection is needed.

import { evaluateTagToken, evaluateTextToken } from "./lessonFileTokenEvaluater";
import { LessonStepDetails, StepPanelType, LessonParseResult, LessonMetadata, LessonParseNestSection } from "@/types/types";

// Some constants that affect multiple parts of the parser, in case they need to be tweaked.
// For an explanation of each option, see below
export interface LessonParserConfiguration {
    PLACEHOLDER_TEXT: string,

    CONTINUE_FROM_CLOSER_TYPO: boolean,
    CONTINUE_FROM_MISSING_CLOSER: boolean,
    //CONTINUE_FROM_MAX_STEPS: boolean,

    ALLOW_ATTRIBUTES_IN_STEP_NEST: boolean,
    ALLOW_HINTS_IN_STEP_NEST: boolean,
    ALLOW_METADATA_IN_BASE_NEST: boolean,
    ALLOW_MULTIPLE_METADATA_SECTIONS: boolean,
    ALLOW_MULTIPLE_STEP_SUBSECTIONS: boolean,
    ALLOW_REQUIREMENTS_ABOVE_MAX_VALUES: boolean,
    ALLOW_REQUIREMENTS_IN_STEP_NEST: boolean,
    
    MAX_HINTS_PER_STEP: number,
    MAX_LESSON_STEPS: number,
    MAX_LENGTH_DESCRIPTION: number,
    MAX_LENGTH_HINT_TEXT: number,
    MAX_LENGTH_STEPREF: number,
    MAX_LENGTH_TITLE: number,
    MAX_REQ_ARG_FAILED_ATTEMPTS: number,
    MAX_REQ_ARG_TIME_PASSED: number,
    MAX_REQUIREMENTS_PER_HINT: number,
    MAX_REQUIREMENTS_PER_STEP:  number,
}

// Takes a string array as a parameter, being the uploaded lesson file split into individual lines (better for debug messages).
export function parseFullLessonFile(sourceLines: string[]) : LessonParseResult {
    // Parser Configuration Settings - affects how the parser behaves towards certain error cases.
    const parserConfig: LessonParserConfiguration = {
        // Placeholder text - a text string that uses multiple spaces to ensure it cannot be replicated by the Lesson File programmer (parser removes duplicate spaces).
        PLACEHOLDER_TEXT: "PLACEHOLDER     TEXT",

        // 'Continues' - affects whether the parser tries to workaround some error cases to continue debugging the rest of the Lesson file (throws ERROR instead of FATAL ERROR)
        CONTINUE_FROM_CLOSER_TYPO: true, // Whether the parser should work around likely mistyped closer tags that are missing '/' (e.g. <attributes><panel-type bar><attributes>)
        CONTINUE_FROM_MISSING_CLOSER: true, // Whether the parser should ignore missing closing tags and work around them. Maybe risky as it is not always picked up (e.g. text segments)
        //CONTINUE_FROM_MAX_STEPS: false, // Whether the parser should continue checking the file past the step limit. Seems useless if the user will need to remove them anyway + size limit risks.

        // 'Allows' - affects whether the parser permits some coding choices by the Lesson File programmer. Any case set to 'true' usually converts an ERROR to a suggestion/warning
        ALLOW_ATTRIBUTES_IN_STEP_NEST: true, // Whether Attribute tags can be placed inside Steps without needing an <attributes> section. Putting 'false' enforces code better code organisation.
        ALLOW_HINTS_IN_STEP_NEST: true, // Whether Hints can be placed inside Steps without needing a <hint-list> section. If 'true', it only gives a suggestion with more than one hint.
        ALLOW_METADATA_IN_BASE_NEST: false, // Whether Metadata sections can be placed unnested (in base_nest). Putting 'false' enforces better code organisation.
        ALLOW_MULTIPLE_METADATA_SECTIONS: true, // Whether a Lesson File can contain more than one <metadata> section. Best practice is only one section at the top.
        ALLOW_MULTIPLE_STEP_SUBSECTIONS: false, // Whether Steps can have duplicate subsections. An example is a Step with two <attributes> sections. Harder to detect duplicate contents when 'true'.
        ALLOW_REQUIREMENTS_ABOVE_MAX_VALUES: true, // Whether Requirement tags with number values can go beyond their recommended limits. Putting 'true' just leaves a suggestion instead.
        ALLOW_REQUIREMENTS_IN_STEP_NEST: true, // Whether Requirement tags can be placed inside Steps without needing an <requirements> section. Steps usually have only 0-1 requirements anyway so should be fine.
      
        // Number values, mainly for maximums to enforce limits to inputted data
        MAX_HINTS_PER_STEP: 5, // Maximum amount of hints that one step can have
        MAX_LESSON_STEPS: 40, // Maximum steps in one lesson file. Current graphics start to break at 42+ steps, so this is a good number to settle on.
        MAX_LENGTH_DESCRIPTION: 400, // Maximum amount of characters for the Lesson description.
        MAX_LENGTH_HINT_TEXT: 200, // Maximum length for <text> section inside a Hint.
        MAX_LENGTH_STEPREF: 30, // Maximum length for each stepRef
        MAX_LENGTH_TITLE: 100, // Maximum amount of characters for the Lesson title.
        MAX_REQ_ARG_FAILED_ATTEMPTS: 8, // Maximum value for <failed-attempts X> Requirement for hints. 
        MAX_REQ_ARG_TIME_PASSED: 300, // Maximum value for <time-passed X> requirement, where X is in seconds.
        MAX_REQUIREMENTS_PER_HINT: 3, // Maximum amount of requirements that one HINT can have. Needs to be lower for memory usage limitations.
        MAX_REQUIREMENTS_PER_STEP: 10, // Maximum amount of requirements that one STEP can have

    };

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
        ERRORS: [],
        warnings: [],
        suggestions: [],
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
    const currentNestLevels: LessonParseNestSection[] = [{nestLevel: "base_nest", contents: []}]; // Acts as a stack to keep track of the current section being read.
    let currentNest = "base_nest"; // Used for text handling logic
    const nestLevelsWithValidText: string[] = ["text", "python", "title", "description", "#"]; // Sections that involve text, used to allow writing < and > 

    // When building the parser logic, I had the choice of using a regular expression tokenizer or an individual character scanner.
    // Regex tokenizing would be more efficient, but could have problems regarding Python segments, stray < and > characters, missing spaces, and potentially more.
    // Since there is a size limit for the inputted lesson file, this uses a character scanner as a DFA.

    let currentWord = "";
    let currentToken = ""; // Stores the current token (not word) as it is read and built. Can go across multiple lines. Some examples of tokens:
    // <step StepOne>
    // </step>
    // Hello world.         <-- Text between <text> and </text>
    // if(x > 1):           <-- Python text
    // <panel-type bar>
    let readingTextToken = false; // Used for logic that allows < and > to be written in text segments and python code without causing issues
    let firstLineOfTextToken = 0; // Stores the line that a text token begins on since they can span multiple lines. Used for more accurate debug messages.

    // Default step for each step to build off - note that this will be modified by the <default> section
    // Default values are labelled for each part in the documentation.
    const defaultStepTemplate: LessonStepDetails = {
        stepRef: parserConfig.PLACEHOLDER_TEXT,
        hints: [],
        requirements: [],

        panelType: StepPanelType.LEFT_POPUP,
        textContent: parserConfig.PLACEHOLDER_TEXT,
    };

    // Main loop
    for (let lineNum = 0; lineNum < sourceLines.length; lineNum++) {
        //console.log("Reading line " + (lineNum + 1) + ": " + sourceLines[lineNum]);
        for (let charNum = 0; charNum < sourceLines[lineNum].length; charNum++) {
            // Could use for-each, but that prevents accessing nearby chars + detecting end of line
            const ch = sourceLines[lineNum][charNum];
            //console.log("Reading character " + (charNum + 1) + ": " + ch);
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
                    
                if ((!readingTextToken && (ch == "<" || ch == ">")) ||                                                  // If reading tag, look for < and >
                    (sourceLines[lineNum].slice(charNum, charNum + 2 + currentNest.length) == ("</" + currentNest))){   // If reading text, only look for respective closing tag

                    // Cases where a token should end, as a tag has either been reached or ended
                    if(isTokenValidTag(currentToken)) {
                        // Updates stepRef based on return value, most of the time this stays the same though
                        evaluateTagToken(currentToken, currentNestLevels, lineNum + 1, parseResult, defaultStepTemplate, parserConfig);
                    }
                    else {
                        evaluateTextToken(currentToken, currentNestLevels, firstLineOfTextToken + 1, parseResult, defaultStepTemplate, parserConfig);
                    }
                    
                    currentToken = "";
                    readingTextToken = false;

                    if(!parseResult.success) { 
                        break; // Early termination from a fatal error
                    }  
                }

                // Reset the word, ensuring that < isn't lost (in cases like ...hello world</text> where there is no space between end of token and text)
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

    //debug
    console.error("Suggestions:");
    for (let i = 0; i < parseResult.suggestions.length; i++) {
        console.log(parseResult.suggestions[i].sectionRef + " - " + parseResult.suggestions[i].errorMessageContent);
    }
    console.error("Warnings:");
    for (let i = 0; i < parseResult.warnings.length; i++) {
        console.error(parseResult.warnings[i].sectionRef + " - " + parseResult.warnings[i].errorMessageContent);
    }
    console.error("Errors:");
    for (let i = 0; i < parseResult.ERRORS.length; i++) {
        console.error(parseResult.ERRORS[i].sectionRef + " - " + parseResult.ERRORS[i].errorMessageContent);
    }
    console.log("All steps:");
    for (let i = 0; i < parseResult.steps.length; i++) {
        console.log(parseResult.steps[i].stepRef + " - " + parseResult.steps[i].textContent);
        console.log(parseResult.steps[i].requirements.length + " requirements.");
        console.log(parseResult.steps[i].hints.length + " hints.");
    }
    //debug

    //TBC: FINAL CHECKS AFTER READING FILE (e.g. currentToken == "", nest is base_nest, no title, too few steps)

    return parseResult;
}

// Private helper function that checks whether a token is a tag
function isTokenValidTag(token: string) {
    return (token[0] == "<" && token[token.length - 1] == ">");
}