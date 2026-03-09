// Helper file for handling the reading and parsing of Strype Lesson Files.
// Takes an uploaded text file as input, handled by the Lesson Selection Component.
// Splits the file into 'tokens' which are handled by lessonFileTokenEvaluater.ts to build a LessonParseResult object.

// Since it takes the file as a parameter and returns the steps information to the component, no store connection is needed.

import { evaluateTagToken, evaluateTextToken } from "./lessonFileTokenEvaluater";
import { LessonStepAttributes, StepPanelType, LessonParseResult, LessonMetadata, LessonParseNestSection } from "@/types/types";

// Takes a string array as a parameter, being the uploaded lesson file split into individual lines (better for debug messages).
export function parseFullLessonFile(sourceLines: string[]) : LessonParseResult {
    // Lesson Detail object
    const lessonDetails: LessonMetadata = {
        title: "PLACEHOLDER     TEXT", // Uses multiple spaces so that it can't be somehow accidentally replicated by Lesson File programmer
        description: "PLACEHOLDER     TEXT",
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
    // <panel-type BAR>
    let readingTextToken = false; // Used for logic that allows < and > to be written in text segments and python code without causing issues
    let firstLineOfTextToken = 0; // Stores the line that a text token begins on since they can span multiple lines. Used for more accurate debug messages.

    // Default step for each step to build off - note that this will be modified by the <default> section
    // Default values are labelled for each attribute in the documentation.
    const defaultStepTemplate: LessonStepAttributes = {
        stepRef: "PLACEHOLDER",
        panelType: StepPanelType.LEFT_POPUP,
        textContent: "PLACEHOLDER     TEXT", // Uses multiple spaces so that it can't be somehow accidentally replicated by Lesson File programmer
        //TBC
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
                        evaluateTagToken(currentToken, currentNestLevels, lineNum + 1, parseResult, defaultStepTemplate);
                    }
                    else {
                        evaluateTextToken(currentToken, currentNestLevels, firstLineOfTextToken + 1, parseResult, defaultStepTemplate);
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
    }
    //debug

    //TBC: FINAL CHECKS AFTER READING FILE (e.g. no title, too few steps)

    return parseResult;
}

// Private helper function that checks whether a token is a tag
function isTokenValidTag(token: string) {
    return (token[0] == "<" && token[token.length - 1] == ">");
}