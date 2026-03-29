// Helper file for lessonFileParser.ts, handling the evaluation of each and every individual tag/text token.

import { LessonParserConfiguration } from "@/helpers/lessonFileParser";
import {LessonStepDetails, StepPanelType, StepRequirementType, LessonParseErrorMessage, LessonParseResult, LessonParseNestSection } from "@/types/types";

// Function for generating suggestions, errors and warnings
function newDebugMessage(message: string, context: LessonParseTokenContext, lineNumOffset: number, overrideDocText?: string, overrideDocLink?: string) : LessonParseErrorMessage {
    let sectionRefText = "Line " + (context.lineNum + lineNumOffset);
    if(context.stepRef != "") {
        sectionRefText += ", Step '" + context.stepRef + "'";
    }

    const debugMessage: LessonParseErrorMessage = {
        errorMessageContent: message,
        sectionRef: sectionRefText,
        documentationText: overrideDocText ?? context.docText, //optional
        documentationLink: overrideDocLink ?? context.docLink, //optional
    };

    return debugMessage;
}

// All attributes that take a specific set of valid parameters have their lists kept consistent here
export function fetchValidParameters(token: string): string[] {
    switch(token) {
    case("colour-scheme"):
        return ["red", "orange", "green", "blue", "pink", "monochrome"];

    case("difficulty"):
        return ["easy", "beginner", "medium", "intermediate", "hard", 
            "advanced", "extreme", "1-star", "2-star", "3-star", 
            "4-star", "5-star"];
    case("panel-type"):
        // IMPORTANT: tagToken_panelType has its own string->Enum map for parsing the token, named 'panelArgMap'.
        // When a new value is put here, it will also need to be added there.
        return ["popup-left", "popup-right", "bar", "central-focus"];
    }
    return []; //empty return when no value is matched
}

// Context object storing all info needed for tag token evaluation methods (prevents helper methods requiring 5+ parameters)
interface LessonParseTokenContext {
    // Store of <defaults> step, which can be modified
    defaultsStepTemplate: LessonStepDetails;

    // Breakdown of token into individual words
    tokenArgs: string[];

    // Nest level related data for the parser to track
    currentNestLevels: LessonParseNestSection[];
    thisNest: LessonParseNestSection;

    // Information used for debug messages
    stepRef: string;
    lineNum: number;
    docText: string;
    docLink: string;

    // Initial settings and data used for the parser
    config: LessonParserConfiguration;
}

// ----- TEXT TOKENS -----

// Main token reader for text, making changes to parseResult as required. Logic is much simpler as most error cases are already handled in evaluateTagToken().
// Unlike evaluateTagToken, all logic is kept within this one function. Each case is much shorter with much fewer errors to account for, and there are much fewer unique tokens to handle.
// NOTE: ANY NEW TEXT TOKEN SECTIONS MUST BE LABELLED IN THE nestLevelsWithValidText[] LIST INSIDE lessonFileParser.ts
export function evaluateTextToken(token: string, nestLevels: LessonParseNestSection[], currentLineNum: number, parseResult: LessonParseResult, initialDefaultStep: LessonStepDetails, parserConfig: LessonParserConfiguration) : void {
    // -- SPECIAL FAILSAFE -- 
    if(nestLevels.length == 0) { // "root" has somehow been popped
        // This should never be encountered by a user, but this will break a LOT of stuff if it happens to occur, so this is mainly for debugging.
        nestLevels.push({nestLevel: "root", contents: []});
        console.error("Lesson Error: 'root' was somehow popped. There is a major fault with the parser.");
    }

    // -- SILENT RETURN CASES --
    if(token.replace(/\s/g, "") == "") {
        return; // Ignore and skip empty tokens, as the logic above may generate them
    }

    if(token[token.length - 1] == " ") {
        // Some syntax patterns leave a random space at the end of a text token, more consistent to remove early
        token = token.slice(0, -1);
    }

    if(token == "<") {
        return; 
        // Error-free lesson files will still produce many extra tokens that just contain the start of a tag. 
        // Preventing these cases would be a big unreadable mess of if conditions, so this is neater.
    }

    if(nestLevels[nestLevels.length - 1].nestLevel == "#") {
        return;
        // Text token is a comment. Handled before the error cases to prevent errors caused by comments.
    }

    // -- INIT --
    const context: LessonParseTokenContext = {
        // These elements should NOT be edited beyond first initialization, instead only being read
        tokenArgs: token.slice(1, -1).split(" "), // Removes the < and >, and then splits by space
        lineNum: currentLineNum,
        config: parserConfig,

        // These elements could be edited
        stepRef: parseResult.steps.length > 0 ? parseResult.steps[parseResult.steps.length - 1].stepRef : "", //Obtain stepRef from parseResult
        docText: "", // Used to store a tag's specific documentation info, which will be used in most debug messages unless another page is more important
        docLink: "",
        currentNestLevels: nestLevels,
        thisNest: nestLevels[nestLevels.length - 1],
        defaultsStepTemplate: initialDefaultStep, // Modified by <defaults>, cloned by <step>
    };

    console.log("Detected text token: " + token + " at nest level " + context.thisNest.nestLevel); //debug

    // -- INSTANT ERROR CASES --
    if(token[0] == "<") {
        // Assuming previous case didn't hit, this is most likely caused by an incomplete tag typo, such as "</step".
        parseResult.ERRORS.push(newDebugMessage("FATAL - Likely mistyped tag: " + token.split(" ")[0] + ". If this is incorrect, refer to the documentation for handling < and > symbols in text.", context, 0)); //TBC DOCUMENTATION: SPECIAL CHARACTERS
        parseResult.success = false;
        return;
    }

    if(token[token.length - 1] == ">") {
        // Same as above but other way around, such as "text>".
        parseResult.ERRORS.push(newDebugMessage("FATAL - Likely mistyped tag: " + token.split(" ").at(-1) + ". If this is incorrect, refer to the documentation for handling < and > symbols in text.", context, 0)); //TBC DOCUMENTATION: SPECIAL CHARACTERS
        parseResult.success = false;
        return;
    }
    
    if(context.currentNestLevels.length == 1) {
        // Text token is on root, meaning it is not in any sections
        parseResult.ERRORS.push(newDebugMessage("FATAL - Unsectioned text segment: '" + (token.length > 32 ? (token.slice(0, 32) + "...") : token) + "' To add comments safely, please use the comment tags <#> </#>.", context, 0)); //TBC DOCUMENTATION: COMMENTS
        parseResult.success = false;
        return;
    }

    // Valid text tokens are stored between a single opening and closing tag. This means that the behaviour of this function can be sorted by the current nest level.
    // Similar to evaluateTagToken(), they are implemented in alphabetical order.
    // Same briefing about requirements and debug messages from evaluateTagToken() applies here too.

    // -- TEXT TOKEN HANDLING --

    // nest level "#" (comments) is handled in Silent Return cases. No further logic is needed for the text token as it is simply a comment.

    ////////////////////////\\\\\\\\\\\\\\\\\\\\\\\\
    if(context.thisNest.nestLevel == "description") { 
        context.docText = "Lesson Description";
        context.docLink = "TBC DOCUMENTATION";

        // [u] Title isn't too long
        if(token.length > context.config.MAX_LENGTH_DESCRIPTION) {
            parseResult.warnings.push(newDebugMessage("Lesson Description shortened due to exceeding the character limit of " + context.config.MAX_LENGTH_DESCRIPTION + ".", context, 0, "", ""));
        }

        parseResult.details.description = token.slice(0, context.config.MAX_LENGTH_DESCRIPTION);
        context.thisNest.contents.push("valid_token"); // Indicator that there is a valid text token within this nest
        return;
    }

    ////////////////////////\\\\\\\\\\\\\\\\\\\\\\\\
    if(context.thisNest.nestLevel == "text") { 
        context.docText = "Step Text";
        context.docLink = "TBC DOCUMENTATION";

        if(context.currentNestLevels[1].nestLevel != "step") {
            // If the parent nest level is invalid, no error message is needed due to that already being displayed by the tag token evaluator
            return;
        }

        // Update the step
        parseResult.steps[parseResult.steps.length - 1].textContent = token;
        context.thisNest.contents.push("valid_token"); // Indicator that there is a valid text token within this nest
        return;
    }

    ////////////////////////\\\\\\\\\\\\\\\\\\\\\\\\
    if(context.thisNest.nestLevel == "text_inHint") { // HINT VARIANT OF <text>
        context.docText = "Step Hints";
        context.docLink = "TBC DOCUMENTATION";

        // [u] Text isn't too long
        if(token.length > context.config.MAX_LENGTH_DESCRIPTION) {
            parseResult.warnings.push(newDebugMessage("Hint Text '" + token.slice(0, 32) + "...' shortened due to exceeding the character limit of " + context.config.MAX_LENGTH_HINT_TEXT + ".", context, 0, "", ""));
        }

        // Update the hint
        const currentStep = parseResult.steps[parseResult.steps.length - 1];
        currentStep.hints[currentStep.hints.length - 1].message = token.slice(0, context.config.MAX_LENGTH_HINT_TEXT);
        context.thisNest.contents.push("valid_token"); // Indicator that there is a valid text token within this nest
        return;
    }

    ////////////////////////\\\\\\\\\\\\\\\\\\\\\\\\
    if(context.thisNest.nestLevel == "title") { 
        context.docText = "Lesson Title";
        context.docLink = "TBC DOCUMENTATION";

        // [u] Title isn't too long
        if(token.length > context.config.MAX_LENGTH_TITLE) {
            parseResult.warnings.push(newDebugMessage("Lesson Title shortened due to exceeding the character limit of " + context.config.MAX_LENGTH_TITLE + ".", context, 0, "", ""));
        }

        parseResult.details.title = token.slice(0, context.config.MAX_LENGTH_TITLE);
        context.thisNest.contents.push("valid_token"); // Indicator that there is a valid text token within this nest
        return;
    }
    
    ////////////////////////\\\\\\\\\\\\\\\\\\\\\\\\
    // If this point is reached, then the text is not stored within a valid nest. Due to the possibility of it containing another tag, this needs to be a FATAL error.
    // (if this message is shown for a valid nest, then that nest's if-condition is missing a return; at the end of its blcok)
    parseResult.ERRORS.push(newDebugMessage("FATAL - Invalid location for text segment: '" + (token.length > 32 ? (token.slice(0, 32) + "...") : token) + "' Uncommented text segments cannot be included in the <" + context.thisNest.nestLevel.split("_")[0] + "> section. To add comments safely, please use the comment tags <#> </#>.", context, 0)); //TBC DOCUMENTATION: COMMENTS
    parseResult.success = false;
    return;    
}

// ----- TAG TOKENS -----

// Main token reader for tags, making changes to nestLevel and parseResult as required. This is the main handler for the language's syntax.
// Individual tag tokens have their own unique function for logic and debugging, named as tagToken_{token}().
export function evaluateTagToken(token: string, nestLevels: LessonParseNestSection[], currentLineNum: number, parseResult: LessonParseResult, initialDefaultStep: LessonStepDetails, parserConfig: LessonParserConfiguration) : void {
    // -- SPECIAL FAILSAFE -- 
    if(nestLevels.length == 0) { // "root" has somehow been popped
        // This should never be encountered by a user, but this will break a LOT of stuff if it happens to occur, so this is mainly for debugging.
        nestLevels.push({nestLevel: "root", contents: []});
        console.error("Lesson Error: 'root' was somehow popped. There is a major fault with the parser.");
    }
    
    // -- INIT --
    const context: LessonParseTokenContext = {
        // These elements should NOT be edited beyond first initialization, instead only being read
        tokenArgs: token.slice(1, -1).split(" "), // Removes the < and >, and then splits by space
        lineNum: currentLineNum,
        config: parserConfig,

        // These elements could be edited
        stepRef: parseResult.steps.length > 0 ? parseResult.steps[parseResult.steps.length - 1].stepRef : "", //Obtain stepRef from parseResult
        docText: "", // Used to store a tag's specific documentation info, which will be used in most debug messages unless another page is more important
        docLink: "",
        currentNestLevels: nestLevels,
        thisNest: nestLevels[nestLevels.length - 1],
        defaultsStepTemplate: initialDefaultStep, // Modified by <defaults>, cloned by <step>
    };
  
    // Lists of all potentially missing closing tags in the step nest level, mainly used for detecting commonly missing closing tags and working around them them
    const stepAllSubsections = ["text", "attributes", "requirements", "hints", "hint-list"];

    // -- INSTANT ERROR CASES --

    if(token == "<>" || token.replace(/\s/g, "") == "<>") { // .replace(/\s/g, "") <- whitespace remover
        parseResult.warnings.push(newDebugMessage("Ignoring empty tag: " + token + ".", context, 0, "", ""));
        return;
    }

    // To check the expected functionality of any tag, refer to the documentation.
    // Tags which take parameters will have their list of valid inputs handled within the tagToken_ method for that Tag.

    // Requirements with comments marked [u] are unique to that tags' context. 
    // Requirements will only return early if the tag should be ignored, or parsing should cease due to a 'FATAL' error.

    // Use case for Debug Messages:
    // - Suggestions: messages to inform the user of better coding practice. The mentioned changes will have no effect beyond better code readability.
    // - Warnings: messages to inform the programmer that they have made some slight mistake, and the parser has made placeholder changes to solve it.
    // - Errors: the programmer has made a severe mistake that needs to be solved before running the lesson. The parser will continue beyond it.
    // - FATAL Errors: the programmer has made a severe mistake that has crashed the parser. It will need to be solved before the parser can scan further.
    // The programmer will not be able to run the lesson if there are any errors. They can, however, run it with many warnings.

    // -- TAG HANDLING --
    console.log("Detected tag token: " + token + " at nest level " + context.thisNest.nestLevel); //debug

    if(context.tokenArgs[0] == "#" || context.tokenArgs[0] == "/#") { 
        context.docText = "Comments";
        context.docLink = "TBC DOCUMENTATION";
        tagToken_commentHashtag(context, parseResult);
        return;
    }

    if(context.tokenArgs[0] == "attributes" || context.tokenArgs[0] == "/attributes") { 
        context.docText = "Step Attributes";
        context.docLink = "TBC DOCUMENTATION";
        tagToken_attributes(stepAllSubsections, context, parseResult);
        return;
    }

    if(context.tokenArgs[0] == "colour-scheme" || context.tokenArgs[0] == "/colour-scheme" ||
        context.tokenArgs[0] == "color-scheme" || context.tokenArgs[0] == "/color-scheme") {
        context.docText = "Colour Scheme";
        context.docLink = "TBC DOCUMENTATION";
        tagToken_colourScheme(context, parseResult);
        return;
    }

    if(context.tokenArgs[0] == "defaults" || context.tokenArgs[0] == "/defaults") { 
        context.docText = "Attribute Defaults";
        context.docLink = "TBC DOCUMENTATION";
        tagToken_defaults(context, parseResult);
        return;
    }

    if(context.tokenArgs[0] == "description" || context.tokenArgs[0] == "/description") {
        context.docText = "Lesson Description";
        context.docLink = "TBC DOCUMENTATION";
        tagToken_description(context, parseResult);
        return;
    }

    if(context.tokenArgs[0] == "difficulty" || context.tokenArgs[0] == "/difficulty") {
        context.docText = "Lesson Difficulty";
        context.docLink = "TBC DOCUMENTATION";
        tagToken_difficulty(context, parseResult);
        return;
    }

    if(context.tokenArgs[0] == "estimated-time" || context.tokenArgs[0] == "/estimated-time") {
        context.docText = "Lesson Estimated Time";
        context.docLink = "TBC DOCUMENTATION";
        tagToken_estimatedTime(context, parseResult);
        return;
    }

    if(context.tokenArgs[0] == "failed-attempts" || context.tokenArgs[0] == "/failed-attempts") {
        context.docText = "Failed Attempts Requirement";
        context.docLink = "TBC DOCUMENTATION";
        tagToken_failedAttempts(context, parseResult);
        return;
    }

    if(context.tokenArgs[0] == "hide-expected-values" || context.tokenArgs[0] == "/hide-expected-values") {
        context.docText = "Hide Expected Values for Requirements";
        context.docLink = "TBC DOCUMENTATION";
        tagToken_hideExpectedValues(context, parseResult);
        return;
    }

    if(context.tokenArgs[0] == "hint" || context.tokenArgs[0] == "/hint") {
        context.docText = "Step Hints";
        context.docLink = "TBC DOCUMENTATION";
        tagToken_hint(context, parseResult);
        return;
    }

    if(context.tokenArgs[0] == "hint-list" || context.tokenArgs[0] == "/hint-list") {
        context.docText = "Step Hints";
        context.docLink = "TBC DOCUMENTATION";
        tagToken_hintList(stepAllSubsections, context, parseResult);
        return;
    }


    if(context.tokenArgs[0] == "metadata" || context.tokenArgs[0] == "/metadata") { 
        context.docText = "Lesson Metadata";
        context.docLink = "TBC DOCUMENTATION";
        tagToken_metadata(context, parseResult);
        return;
    }

    if(context.tokenArgs[0] == "panel-type" || context.tokenArgs[0] == "/panel-type") { 
        context.docText = "Step Panel Type";
        context.docLink = "TBC DOCUMENTATION";
        tagToken_panelType(context, parseResult);
        return;
    }

    if(context.tokenArgs[0] == "requirements" || context.tokenArgs[0] == "/requirements") { 
        context.docText = "Step Requirements";
        context.docLink = "TBC DOCUMENTATION";
        // This tag has multiple use cases that have been split into seperate 'Variant' functions
        if(context.thisNest.nestLevel == "hint" || context.thisNest.nestLevel == "requirements_inHint") {
            // Requirements section for a specific hint
            tagToken_requirements_inHint(context, parseResult);
        }
        else {
            // [PRIMARY] Requirements section for a step
            tagToken_requirements(stepAllSubsections, context, parseResult);
        }
        return;
    }

    if(context.tokenArgs[0] == "run-code" || context.tokenArgs[0] == "/run-code") { 
        context.docText = "Run Code Requirement";
        context.docLink = "TBC DOCUMENTATION";
        tagToken_runCode(context, parseResult);
        return;
    }

    if(context.tokenArgs[0] == "step" || context.tokenArgs[0] == "/step") { 
        context.docText = "Steps";
        context.docLink = "TBC DOCUMENTATION";
        tagToken_step(stepAllSubsections, context, parseResult);
        return;
    }

    if(context.tokenArgs[0] == "text" || context.tokenArgs[0] == "/text") {
        context.docText = "Step Text";
        context.docLink = "TBC DOCUMENTATION";
        // This tag has multiple use cases that have been split into seperate 'Variant' functions
        if(context.thisNest.nestLevel == "hint" || context.thisNest.nestLevel == "text_inHint") {
            // Text for a specific hint
            tagToken_text_inHint(context, parseResult);
        }
        else {
            // [PRIMARY] Text for a step
            tagToken_text(stepAllSubsections, context, parseResult);
        }
        return;
    }

    if(context.tokenArgs[0] == "time-passed" || context.tokenArgs[0] == "/time-passed") {
        context.docText = "Time Passed Requirement";
        context.docLink = "TBC DOCUMENTATION";
        tagToken_timePassed(context, parseResult);
        return;
    }


    if(context.tokenArgs[0] == "title" || context.tokenArgs[0] == "/title") {
        context.docText = "Lesson Title";
        context.docLink = "TBC DOCUMENTATION";
        tagToken_title(context, parseResult);
        return;
    }

    // If this point is reached, then the tag has not been matched to any valid input. 
    // (if this message is shown for a valid tag, then that tag's if-condition is missing a return; at the end of its blcok)
    parseResult.warnings.push(newDebugMessage("Unknown tag: " + token + ". Check for typos and refer to the documentation for all of valid tags. This tag will be ignored.", context, 0, "", ""));
}

// ALL TAG TOKEN FUNCTIONS DEFINED BELOW.
// Tag Token Functions 'tagToken_' are defined in groups based on usage, structured similarly to the Documentation.

// Also has Helper functions, denoted as 'tagTokenHelper_'s. Used to reduce the amount of repeated code.
// Helper functions should only create debug messages and some return true if early termination is needed. 
// ANY LOGIC BEYOND THIS SHOULD BE KEPT OUTSIDE THE HELPERS.

/* TEMPLATE FOR NEW TAG TOKEN EVAL FUNCTION
////////////////////////\\\\\\\\\\\\\\\\\\\\\\\\
function tagToken_REPLACETHIS(context: LessonParseTokenContext, parseResult: LessonParseResult) {
    const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token

    if(context.tokenArgs[0][0] != "/") { // opener tag
        // Nest Level Requirement:

        // Arguments Requirement:

        // Uniqueness Requirement:

    }
    else { // closer tag

    }
}
*/

/////////////////////////////////////////
// --- GLOBAL/MISC FUNCTIONALITIES --- //
/////////////////////////////////////////
// Tags that are found anywhere in the Lesson File + Helpers that apply to multiple types of Tag Token.

// Comments <#></#>
function tagToken_commentHashtag(context: LessonParseTokenContext, parseResult: LessonParseResult) { // Can't use # in a function name
    //const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token

    if(context.tokenArgs[0][0] != "/") { // opener tag
        // Nest Level Requirement: any nest can take comments

        // Arguments Requirment: no args
        tagTokenHelper_noArgsGeneric(context, parseResult);

        // Do nothing beyond adding the nest layer. This is just a comment.
        context.currentNestLevels.push({nestLevel: "#", contents: []}); 
    }
    else { // closer tag
        // Basic nest level and args requirements for closing tags
        if(tagTokenHelper_closeTagGeneric(context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        context.currentNestLevels.pop();
    }
}

// Default suggestion message for similarly sounding tags being confused
// nestCheck <- the nest(s) where this likely happened
// potentialToken <- the tag that should be in its place
// Also overrides docText and docLink to direct the user to the potentialToken
function tagTokenHelper_similarTagSuggestion(nestCheck: string[], potentialToken: string, context: LessonParseTokenContext, parseResult: LessonParseResult, docText: string, docLink: string) {
    if(nestCheck.includes(context.thisNest.nestLevel)) {
        parseResult.suggestions.push(newDebugMessage("<" + context.tokenArgs[0] + "> tag detected within <" + context.thisNest.nestLevel.split("_")[0] + "> section. Did you mean <" + potentialToken + ">?", context, 0, docText, docLink));
    }
}

// Baseline 'no args' requirement.
// No return needed as arguments are simply ignored
function tagTokenHelper_noArgsGeneric(context: LessonParseTokenContext, parseResult: LessonParseResult, overrideMessage?: string) {
    if(context.tokenArgs.length > 1) {
        parseResult.warnings.push(newDebugMessage(overrideMessage ?? "Unnecessary arguments found within tag: <" + context.tokenArgs.join(" ") + ">. Excess arguments will be ignored.", context, 0));
    }
}

// Covers all tags expecting a fixed amount of arguments.
// Do not use this method for flexible argument counts.
function tagTokenHelper_fixedArgsGeneric(expectedArgs: number, context: LessonParseTokenContext, parseResult: LessonParseResult) : boolean {
    // Arguments Requirment: dependant on expectedArgs, usually being 0 or 1.
    if(context.tokenArgs.length - 1 > expectedArgs) {
        parseResult.warnings.push(newDebugMessage("Unnecessary arguments found within tag: <" + context.tokenArgs.join(" ") + ">. Expected " + expectedArgs + ", Found " + (context.tokenArgs.length - 1) + ". Excess arguments will be ignored.", context, 0));
    }
    if(context.tokenArgs.length - 1 < expectedArgs) {
        parseResult.warnings.push(newDebugMessage("Missing arguments for tag: <" + context.tokenArgs.join(" ") + ">.  Expected " + expectedArgs + ", Found " + (context.tokenArgs.length - 1) + ". This tag will be ignored.", context, 0));
        return true;
    }

    return false;
}

// Default warning message for when there is no closer tag needed for this type of token
function tagTokenHelper_noCloseTagNeeded(context: LessonParseTokenContext, parseResult: LessonParseResult) {
    parseResult.warnings.push(newDebugMessage("Unnecessary closing tag detected: <" + context.tokenArgs.join(" ") + ">. This tag type does not require a closer. The closer tag will be ignored.", context, 0));
}

// Covers the two main defaults requirements for (almost?) all closing tags:
// - No arguments
// - Valid opening tag (checked by nest level)
// Returns 'true' when evaluateTagToken() needs to return early (ignore the tag).
function tagTokenHelper_closeTagGeneric(context: LessonParseTokenContext, parseResult: LessonParseResult, variantSuffix?: string) : boolean {
    // Variant suffix is used to modify the required nest level for Variant tags (for example text_inHint)

    // Nest Level Requirement: same as the token name without the / (e.g. /text requires text)
    if(context.thisNest.nestLevel != context.tokenArgs[0].slice(1) + (variantSuffix ?? "")) { //slice(1) removes the /
        parseResult.warnings.push(newDebugMessage("Invalid positioning for closing tag: <" + context.tokenArgs.join(" ") + ">, found in '" + context.thisNest.nestLevel.split("_")[0] + "' section. No valid paired opening tag is detected. This tag will be ignored.", context, 0)); //TBC DOCUMENTATION
        return true;
    }

    // Arguments Requirment: no args
    tagTokenHelper_noArgsGeneric(context, parseResult);

    return false;
}

// General helper function that checks for cases where a closer tag </tag> is mistyped as <tag> (no /)
function tagTokenHelper_mistypedCloserCheck(context: LessonParseTokenContext, parseResult: LessonParseResult) : boolean {
    // Nest Level is same as the token name
    if(context.thisNest.nestLevel == context.tokenArgs[0]) {
        if(context.config.CONTINUE_FROM_CLOSER_TYPO) {
            parseResult.ERRORS.push(newDebugMessage("Likely mistyped closer tag: <" + context.tokenArgs.join(" ") + ">. Closer tags must contain the closing symbol '/'. The parser will attempt to continue beyond this.", context, 0)); //TBC DOCUMENTATION: SECTIONS
        
            // Attempts to resolve the issue by removing the step nestLevel and continuing. Only continues to scan for more errors for convenience.
            context.currentNestLevels.pop();
            context.thisNest = context.currentNestLevels[context.currentNestLevels.length - 1];
        }
        else {
            parseResult.ERRORS.push(newDebugMessage("FATAL - Likely mistyped closer tag: <" + context.tokenArgs.join(" ") + ">. Closer tags must contain the closing symbol '/'.", context, 0)); //TBC DOCUMENTATION: SECTIONS
            parseResult.success = false;
        }
        return true;
    }

    return false;
}

// General helper function that takes a list of related sections and checks for missing closer tags.
function tagTokenHelper_subsectionMissingCloserCheck(potentialSubsections: string[], context: LessonParseTokenContext, parseResult: LessonParseResult) : boolean {
    // [u] Check for missing closing tags of other subsections
    if(potentialSubsections.includes(context.thisNest.nestLevel) && context.thisNest.nestLevel != context.tokenArgs[0]) {
        if(context.config.CONTINUE_FROM_MISSING_CLOSER) {
            parseResult.ERRORS.push(newDebugMessage("Likely missing closing tag </" + context.thisNest.nestLevel.split("_")[0] + ">. All section-based tags must have a closer. The parser will attempt to continue beyond this.", context, 0)); //TBC DOCUMENTATION: SECTIONS
            
            // Attempts to resolve the issue by removing the step nestLevel and continuing. Only continues to scan for more errors for convenience.
            context.currentNestLevels.pop();
            context.thisNest = context.currentNestLevels[context.currentNestLevels.length - 1];
        }
        else {
            parseResult.ERRORS.push(newDebugMessage("FATAL - Likely missing closing tag </" + context.thisNest.nestLevel.split("_")[0] + ">. All section-based tags must have a closer.", context, 0)); //TBC DOCUMENTATION: SECTIONS
            parseResult.success = false;
            return true;
        }
    }

    return false;
}

///////////////////////////////////////////
// --- METADATA DEFINITION - 'root/' --- //
///////////////////////////////////////////
// Definition of the Metadata section

// Lesson metadata section for details about the Lesson, such as its title and description
function tagToken_metadata(context: LessonParseTokenContext, parseResult: LessonParseResult) {
    const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token

    if(context.tokenArgs[0][0] != "/") { // opener tag
        // Nest Level Requirement: root (no nesting)
        if(context.thisNest.nestLevel != "root") {
            parseResult.warnings.push(newDebugMessage("Invalid positioning for Metadata tag: " + token + ", found in '" + context.thisNest.nestLevel.split("_")[0] + "' section. The Metadata section should not be nested in other sections. This tag will be ignored.", context, 0));
            return;
        }

        // Arguments Requirment: no args
        tagTokenHelper_noArgsGeneric(context, parseResult);

        // Uniqueness Requirement: one per file (potentially recommended but not enforced)
        if(context.thisNest.contents.includes("metadata")) {
            if(context.config.ALLOW_MULTIPLE_METADATA_SECTIONS) {
                parseResult.suggestions.push(newDebugMessage("Multiple <metadata> sections detected. It is recommended to have a single Metadata section kept at the top of the Lesson File.", context, 0));
            }
            else {
                parseResult.ERRORS.push(newDebugMessage("FATAL - Multiple <metadata> sections detected. Ensure that you have a single Metadata section kept at the top of the Lesson File.", context, 0));
                parseResult.success = false;
                return;
            }
        }

        // [u] Positioning within the file, checked via the contents of root. Recommended to be at the top of the file before any steps or defaults.
        if(context.thisNest.contents.length > 0 && context.thisNest.contents[0] != "metadata") {
            parseResult.suggestions.push(newDebugMessage("Consider moving the <metadata> section to the top of the Lesson File for better organisation.", context, 0));
        }

        context.thisNest.contents.push(context.tokenArgs[0]);
        context.currentNestLevels.push({nestLevel: context.tokenArgs[0], contents: []});
    }
    else { // closer tag
        // Basic nest level and args requirements for closing tags
        if(tagTokenHelper_closeTagGeneric(context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // [u] Empty metadata section
        if(context.thisNest.contents.length == 0) {
            parseResult.warnings.push(newDebugMessage("Empty Metadata section detected. Refer to the documentation for a list of valid tags to be used within this section. This section will be ignored.", context, 0));
            
            // Remove this Metadata record from root contents (will be most recent entry assuming valid opening tag)
            // Prevents a niche error case where user has an empty <metadata> section, and then a valid one right after. Ignoring this section will allow the parser to read the next one as valid.
            context.currentNestLevels[0].contents.pop();
        }

        context.currentNestLevels.pop(); // Remove nestLevel
    }
    // EXTRA MESSAGES IN END OF FILE CHECKS:
    // - No metadata section present
}

//////////////////////////////////////////////////
// --- METADATA CONTENTS - 'root/metadata/' --- //
//////////////////////////////////////////////////
// Contents of the Metadata section that affect the displayed information about a Lesson inside the 'Load Lesson' Modal.

// Description of the Lesson File, displayed at the beginning when starting the Lesson.
function tagToken_description(context: LessonParseTokenContext, parseResult: LessonParseResult) {
    const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token

    if(context.tokenArgs[0][0] != "/") { // opener tag
        // Nest Level Requirement: metadata (or root if allowed by ALLOW_METADATA_IN_ROOT)
        if(context.thisNest.nestLevel == "root" && context.config.ALLOW_METADATA_IN_ROOT) {
            parseResult.suggestions.push(newDebugMessage("Consider placing " + token + " subsection within the Lesson's <metadata> section for better organisation.", context, 0));
        } 
        else if(context.thisNest.nestLevel != "metadata") {
            // Potential mistake between distinguishing <title> and <text>
            tagTokenHelper_similarTagSuggestion(["step", "hint"], "text", context, parseResult, "", ""); //TBC DOCUMENTATION: TEXT

            parseResult.warnings.push(newDebugMessage("Invalid positioning for Description tag: " + token + ", found in '" + context.thisNest.nestLevel.split("_")[0] + "' section. The Lesson's Description should be specified within the <metadata> section. This tag will be ignored.", context, 0));
            return;
        }

        // Arguments Requirment: no args with special informative message
        tagTokenHelper_noArgsGeneric(context, parseResult, "Unnecessary arguments found within tag: <" + context.tokenArgs.join(" ") + ">. These arguments will be ignored.");
    
        // [u] Check for whether value has already been modified (can't use normal nest.contents method due to potentially multiple metadata sections + non-nested tokens)
        if(parseResult.details.description != context.config.PLACEHOLDER_TEXT) {
            parseResult.ERRORS.push(newDebugMessage("FATAL - Multiple Description sections detected. Please ensure the Lesson File only contains one <description> tag.", context, 0));
            parseResult.success = false;
            return;
        }

        context.thisNest.contents.push(context.tokenArgs[0]); // Add to the parent nest
        context.currentNestLevels.push({nestLevel: context.tokenArgs[0], contents: []}); // Only needs to add nest level, evaluateTextToken() handles the rest
    }
    else { // closer tag
        // Basic nest level and args requirements for closing tags
        if(tagTokenHelper_closeTagGeneric(context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // [u] Check that a valid text token was detected in this nest
        if(context.thisNest.contents.length == 0) { // Will contain "valid_node" if text was detected
            parseResult.warnings.push(newDebugMessage("Empty " + token + " section detected. Ensure that text-based sections contain at least one non-whitespace character. This section has been ignored.", context, 0)); //TBC DOCUMENTATION: SECTIONS
            context.currentNestLevels[context.currentNestLevels.length - 2].contents.pop(); // Deletes the respective element from contents of parent node, 'ignoring' the section.
        }

        context.currentNestLevels.pop(); // Remove nestLevel
    }
}

// Difficulty indicator shown in the list of lessons
function tagToken_difficulty(context: LessonParseTokenContext, parseResult: LessonParseResult) {
    const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token

    if(context.tokenArgs[0][0] != "/") { // opener tag
        // Nest Level Requirement: metadata (or root if allowed by ALLOW_METADATA_IN_ROOT)
        if(context.thisNest.nestLevel == "root" && context.config.ALLOW_METADATA_IN_ROOT) {
            parseResult.suggestions.push(newDebugMessage("Consider placing " + token + " subsection within the Lesson's <metadata> section for better organisation.", context, 0));
        } 
        else if(context.thisNest.nestLevel != "metadata") {
            parseResult.warnings.push(newDebugMessage("Invalid positioning for Difficulty tag: " + token + ", found in '" + context.thisNest.nestLevel.split("_")[0] + "' section. The Lesson's Difficulty should be specified within the <metadata> section. This tag will be ignored.", context, 0));
            return;
        }

        // Argument Requirement: 1
        if(tagTokenHelper_fixedArgsGeneric(1, context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // [u] Unknown argument which does not match any valid inputs
        if(!fetchValidParameters("difficulty").includes(context.tokenArgs[1].toLowerCase())) {
            parseResult.warnings.push(newDebugMessage("Unknown Difficulty argument: " + token + ". Refer to the documentation for a list of valid arguments. This tag will be ignored.", context, 0));
            return;
        }
    
        // [u] Check for whether value has already been modified (can't use normal nest.contents method due to potentially multiple metadata sections + non-nested tokens)
        if(parseResult.details.difficulty) {
            parseResult.warnings.push(newDebugMessage("Multiple Difficulty tags detected. Lessons can only be assigned a single Difficulty value. This tag will be ignored.", context, 0));
            return;
        }

        parseResult.details.difficulty = context.tokenArgs[1].toLowerCase(); // Assign the value
        context.thisNest.contents.push(context.tokenArgs[0]); // Add to the parent nest
    }
    else { // closer tag
        // This tag type has no need for a closer tag, and therefore is disregarded
        tagTokenHelper_noCloseTagNeeded(context, parseResult);
    }
}

// Estimated time display shown in the list of lessons
function tagToken_estimatedTime(context: LessonParseTokenContext, parseResult: LessonParseResult) {
    const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token

    if(context.tokenArgs[0][0] != "/") { // opener tag
        // Nest Level Requirement: metadata (or root if allowed by ALLOW_METADATA_IN_ROOT)
        if(context.thisNest.nestLevel == "root" && context.config.ALLOW_METADATA_IN_ROOT) {
            parseResult.suggestions.push(newDebugMessage("Consider placing " + token + " subsection within the Lesson's <metadata> section for better organisation.", context, 0));
        } 
        else if(context.thisNest.nestLevel != "metadata") {
            tagTokenHelper_similarTagSuggestion(["step", "requirements", "hint", "requirements_inHint"], "time-passed", context, parseResult, "", ""); //TBC DOCUMENTATION: TIME PASSED

            parseResult.warnings.push(newDebugMessage("Invalid positioning for Estimated Time tag: " + token + ", found in '" + context.thisNest.nestLevel.split("_")[0] + "' section. The Lesson's Estimated Time should be specified within the <metadata> section. This tag will be ignored.", context, 0));
            return;
        }

        // Argument Requirement: 1
        if(tagTokenHelper_fixedArgsGeneric(1, context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // [u] Argument restrictions: must be a positive integer, shouldn't be insanely high
        if(context.tokenArgs[1] == "0" || !(/^\d+$/.test(context.tokenArgs[1]))) { // '^\d+$' is a Positive Integer Regex, allowing strings that only contain digits 0-9 (no . or -)
            parseResult.warnings.push(newDebugMessage("Invalid argument: " + token + ". This tag only accepts integers greater than 0 as an argument, measured in minutes. This tag will be ignored.", context, 0));
            return;
        }
        if(Number(context.tokenArgs[1]) > 999) {
            parseResult.warnings.push(newDebugMessage("Invalid argument: " + token + ". The maximum value for this argument is 999 minutes. This tag will be ignored.", context, 0));
            return;
        }
    
        // [u] Check for whether value has already been modified (can't use normal nest.contents method due to potentially multiple metadata sections + non-nested tokens)
        if(parseResult.details.estimatedTime) {
            parseResult.warnings.push(newDebugMessage("Multiple Estimated Time tags detected. Lessons can only be assigned a single Difficulty value. This tag will be ignored.", context, 0));
            return;
        }

        parseResult.details.estimatedTime = Number(context.tokenArgs[1]); // Assign the value
        context.thisNest.contents.push(context.tokenArgs[0]); // Add to the parent nest
    }
    else { // closer tag
        // This tag type has no need for a closer tag, and therefore is disregarded
        tagTokenHelper_noCloseTagNeeded(context, parseResult);
    }
}

// Title of the Lesson File (not the project name).
function tagToken_title(context: LessonParseTokenContext, parseResult: LessonParseResult) {
    const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token

    if(context.tokenArgs[0][0] != "/") { // opener tag
        // Nest Level Requirement: metadata (or root if allowed by ALLOW_METADATA_IN_ROOT)
        if(context.thisNest.nestLevel == "root" && context.config.ALLOW_METADATA_IN_ROOT) {
            parseResult.suggestions.push(newDebugMessage("Consider placing " + token + " subsection within the Lesson's <metadata> section for better organisation.", context, 0));
        } 
        else if(context.thisNest.nestLevel != "metadata") {
            // Potential mistake between distinguishing <title> and <text>
            tagTokenHelper_similarTagSuggestion(["step", "hint"], "text", context, parseResult, "", ""); //TBC DOCUMENTATION: TEXT

            parseResult.warnings.push(newDebugMessage("Invalid positioning for Title tag: " + token + ", found in '" + context.thisNest.nestLevel.split("_")[0] + "' section. The Lesson's Title should be specified within the <metadata> section. This tag will be ignored.", context, 0));
            return;
        }

        // Arguments Requirment: no args with special informative message
        tagTokenHelper_noArgsGeneric(context, parseResult, "Unnecessary arguments found within tag: <" + context.tokenArgs.join(" ") + ">. The Lesson Title is specified as a text section, not within tag arguments. These arguments will be ignored.");
    
        // [u] Check for whether value has already been modified (can't use normal nest.contents method due to potentially multiple metadata sections + non-nested tokens)
        if(parseResult.details.title != context.config.PLACEHOLDER_TEXT) {
            parseResult.ERRORS.push(newDebugMessage("FATAL - Multiple Title sections detected. Please ensure the Lesson File only contains one <title> tag.", context, 0));
            parseResult.success = false;
            return;
        }

        context.thisNest.contents.push(context.tokenArgs[0]); // Add to the parent nest
        context.currentNestLevels.push({nestLevel: context.tokenArgs[0], contents: []}); // Only needs to add nest level, evaluateTextToken() handles the rest
    }
    else { // closer tag
        // Basic nest level and args requirements for closing tags
        if(tagTokenHelper_closeTagGeneric(context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // [u] Check that a valid text token was detected in this nest
        if(context.thisNest.contents.length == 0) { // Will contain "valid_node" if text was detected
            parseResult.warnings.push(newDebugMessage("Empty " + token + " section detected. Ensure that text-based sections contain at least one non-whitespace character. This section has been ignored.", context, 0)); //TBC DOCUMENTATION: SECTIONS
            context.currentNestLevels[context.currentNestLevels.length - 2].contents.pop(); // Deletes the respective element from contents of parent node, 'ignoring' the section.
        }

        context.currentNestLevels.pop(); // Remove nestLevel
    }
}

///////////////////////////////////////////////
// --- defaults/STEP DEFINITION - 'root/' --- //
///////////////////////////////////////////////
// Definitions for defaults and Step sections, which both take the same inputs for different results.

// Takes all the same information as <step>, updating the defaults values of aspects not changed by individual Step definitons
function tagToken_defaults(context: LessonParseTokenContext, parseResult: LessonParseResult) {
    const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token

    if(context.tokenArgs[0][0] != "/") { // opener tag
        // Nest Level Requirement: root (no nesting)
        if(context.thisNest.nestLevel != "root") {
            parseResult.warnings.push(newDebugMessage("Invalid positioning for defaults tag: " + token + ", found in '" + context.thisNest.nestLevel.split("_")[0] + "' section. Defaults sections cannot be nested in any other sections. This tag will be ignored.", context, 0));
            return;
        }

        // Arguments Requirment: no args
        tagTokenHelper_noArgsGeneric(context, parseResult);
        
        // [u] lack of steps between this and the previous defaults specification
        if(context.thisNest.contents[context.thisNest.contents.length - 1] == "defaults") {
            parseResult.suggestions.push(newDebugMessage("Multiple Defaults sections with no Steps defined in between detected. Consider merging these into one <defaults> section.", context, 0));
        }

        // Does not need to do anything more since the step subsections contain further logic
        context.thisNest.contents.push(context.tokenArgs[0]); // Add to the parent nest
        context.currentNestLevels.push({nestLevel: context.tokenArgs[0], contents: []}); // Add nest level
    }
    else { // closer tag
        // Basic nest level and args requirements for closing tags
        if(tagTokenHelper_closeTagGeneric(context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // [u] Empty defaults section
        if(context.thisNest.contents.length == 0) {
            parseResult.suggestions.push(newDebugMessage("Empty defaults section detected. No changes to the defaults Step were made.", context, 0));
        }

        context.currentNestLevels.pop(); // Remove nestLevel
    }
    // EXTRA MESSAGES IN END OF FILE CHECKS:
    // - No steps beyond a defaults
}

// Main enclosing section for a single step, taking a stepRef as an argument and containing all step subsections
function tagToken_step(stepAllSubsections: string[], context: LessonParseTokenContext, parseResult: LessonParseResult) {
    const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token
    const totalSteps = parseResult.steps.length;

    if(context.tokenArgs[0][0] != "/") { // opener tag
        // [u] Nest level is either defaults or step - likely forgotten closing tag
        if(context.thisNest.nestLevel == "step" || context.thisNest.nestLevel == "defaults") {
            if(context.config.CONTINUE_FROM_MISSING_CLOSER) {
                parseResult.ERRORS.push(newDebugMessage("Likely missing closing tag </" + context.thisNest.nestLevel.split("_")[0] + ">. All section-based tags must have a closer.", context, -1)); //TBC DOCUMENTATION: SECTIONS
                
                // Attempts to resolve the issue by removing the step nestLevel and continuing. Only continues to scan for more errors for convenience.
                context.currentNestLevels.pop();
                context.thisNest = context.currentNestLevels[context.currentNestLevels.length - 1];
            }
            else {
                parseResult.ERRORS.push(newDebugMessage("FATAL - Likely missing closing tag </" + context.thisNest.nestLevel.split("_")[0] + ">. All section-based tags must have a closer.", context, -1)); //TBC DOCUMENTATION: SECTIONS
                parseResult.success = false;
                return;
            }
        }

        // Nest Level Requirement: root (no nesting)
        if(context.thisNest.nestLevel != "root") {
            parseResult.warnings.push(newDebugMessage("Invalid positioning for Step tag: " + token + ", found in '" + context.thisNest.nestLevel.split("_")[0] + "' section. Steps cannot be nested in any other sections. This tag will be ignored.", context, 0));
            return;
        }

        // [u] Maximum amount of steps
        if(totalSteps == context.config.MAX_LESSON_STEPS) {
            parseResult.ERRORS.push(newDebugMessage("FATAL - Maximum Steps reached. Lesson files are limited to " + context.config.MAX_LESSON_STEPS + " total Steps. Please consider shortening this lesson or combining smaller Steps together.", context, 0)); //TBC DOCUMENTATION: GENERAL LESSON RULES?
            parseResult.success = false;
            return;
        }

        let newStepRef = context.stepRef; //<step> is the only tag that changes stepRef

        // Arguments Requirment: at least 1 for stepRef
        if(context.tokenArgs.length == 1) {
            newStepRef = "Unnamed Step #" + (totalSteps + 1); // e.g. 'Unnamed Step #4'
            context.stepRef = newStepRef; // Update for a more accurate error message
            parseResult.warnings.push(newDebugMessage("Step is missing a name. It is recommended to name each Step uniquely for more effective debugging. Current Step has been renamed to '" + newStepRef + "'.", context, 0));
        }
        else { // stepRef is present
            newStepRef = context.tokenArgs.slice(1).join(" "); // Join all elements beyond element 0 to rebuild stepRef
        }

        // [u] stepRef length
        if(newStepRef.length > context.config.MAX_LENGTH_STEPREF) {
            newStepRef = newStepRef.slice(0, context.config.MAX_LENGTH_STEPREF);
            parseResult.warnings.push(newDebugMessage("Step name shortened due to exceeding the character limit of " + context.config.MAX_LENGTH_STEPREF + ".", context, 0, "", ""));
        }

        // [u] duplicate stepRefs
        for(let s = 0; s < parseResult.steps.length; s++) {
            if(newStepRef == parseResult.steps[s].stepRef) {
                // Replace stepRef with defaults when a duplicate is found
                newStepRef = "Unnamed Step #" + (totalSteps + 1);
                parseResult.warnings.push(newDebugMessage("Duplicate Step name, matching Step #" + (s + 1) + ": " + parseResult.steps[s].stepRef + ". Current Step has been renamed to '" + newStepRef + "'.", context, 0, "", ""));
                break;
            }
        }
        
        // Append the new step as a copy of defaultsStep with the new stepRef
        const newStep = structuredClone(context.defaultsStepTemplate); // Uses structuredClone to ensure new copies of object array attributes are created, for example the requirements list.
        newStep.stepRef = newStepRef; // Assign the new stepRef
        newStep.sourceLineNum = context.lineNum; // Remember this source line num for use in Test Mode's Debug Modal
        parseResult.steps.push(newStep);
        
        context.thisNest.contents.push(context.tokenArgs[0]); // Add to the parent nest
        context.currentNestLevels.push({nestLevel: context.tokenArgs[0], contents: []}); // Add nest level
    }
    else { // closer tag TBC LOADS OF POST STEP COMPLETION CHECKS
        // Basic nest level and args requirements for closing tags
        if(tagTokenHelper_closeTagGeneric(context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // [u] Check for missing closing tags of step-specific subsections
        if(tagTokenHelper_subsectionMissingCloserCheck(stepAllSubsections, context, parseResult)) {
            return true;
        }

        // [u] steps should have custom text as a minimum
        if(parseResult.steps[totalSteps - 1].textContent == context.config.PLACEHOLDER_TEXT || parseResult.steps[totalSteps - 1].textContent == "") {
            parseResult.ERRORS.push(newDebugMessage("Step is missing valid text content. Ensure that every the step has a non-empty <text> section.", context, 0)); //TBC DOCUMENTATION: TEXT
        }

        context.currentNestLevels.pop(); // Remove nestLevel
        context.stepRef = ""; // Empties stepRef as the parser is no longer in a step - helps for debugging
    }
    // EXTRA MESSAGES IN END OF FILE CHECKS:
    // - Too few steps
}

/////////////////////////////////////////////
// --- STEP SUBSECTIONS - 'root/step/' --- //
/////////////////////////////////////////////
// All main subsections in a single step, grouping its respective data accordingly

// Attributes subsection for specifying most data about a specific step / defaults
function tagToken_attributes(stepAllSubsections: string[], context: LessonParseTokenContext, parseResult: LessonParseResult) {
    //const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token

    if(context.tokenArgs[0][0] != "/") { // opener tag
        // [u] Nested inside a <defaults>, which is not required and not advised either
        if(context.thisNest.nestLevel == "defaults") {
            parseResult.warnings.push(newDebugMessage("Defaults sections do not require a nested Attributes section inside them. Individual Attributes should be written directly inside the Defaults section. This tag will be ignored.", context, 0));
            return;
        }

        // Step subsection defaults requirements
        if(tagTokenHelper_stepSubsections(stepAllSubsections, context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        context.thisNest.contents.push(context.tokenArgs[0]); // Add attributes to the parent nest step/defaults
        context.currentNestLevels.push({nestLevel: context.tokenArgs[0], contents: []});
    }
    else { // closer tag
        // Basic nest level and args requirements for closing tags
        if(tagTokenHelper_closeTagGeneric(context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        /* This case seems more annoying than useful - most programmers will likely copy and paste a step template with an attributes section, even for steps with no changes from defaults.
        // [u] Empty attributes section
        if(context.thisNest.contents.length == 0) {
            parseResult.warnings.push(newDebugMessage("Step Attributes section has no content.", context, 0));
        }*/

        context.currentNestLevels.pop(); // Remove nestLevel
    }
}

// Section for containing all of the Step's hints
function tagToken_hintList(stepAllSubsections: string[], context: LessonParseTokenContext, parseResult: LessonParseResult) {
    //const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token

    if(context.tokenArgs[0][0] != "/") { // opener tag
        // Step subsection defaults requirements
        if(tagTokenHelper_stepSubsections(stepAllSubsections, context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        context.thisNest.contents.push(context.tokenArgs[0]); // Add attributes to the parent nest step/defaults
        context.currentNestLevels.push({nestLevel: context.tokenArgs[0], contents: []});
    }
    else { // closer tag
        // Basic nest level and args requirements for closing tags
        if(tagTokenHelper_closeTagGeneric(context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // No message about empty section for the same reason as Attributes

        context.currentNestLevels.pop(); // Remove nestLevel
    }
}

// Requirements section for setting Conditions to unlock the next step button
function tagToken_requirements(stepAllSubsections: string[], context: LessonParseTokenContext, parseResult: LessonParseResult) {
    //const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token

    if(context.tokenArgs[0][0] != "/") { // opener tag
        // Step subsection defaults requirements
        if(tagTokenHelper_stepSubsections(stepAllSubsections, context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        context.thisNest.contents.push(context.tokenArgs[0]); // Add attributes to the parent nest step/defaults
        context.currentNestLevels.push({nestLevel: context.tokenArgs[0], contents: []});
    }
    else { // closer tag
        // Basic nest level and args requirements for closing tags
        if(tagTokenHelper_closeTagGeneric(context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // No message about empty section for the same reason as Attributes

        context.currentNestLevels.pop(); // Remove nestLevel
    }
}

// [STEP VARIANT] Text subsection which contains the displayed text of a step
// Primary variant for handling most of the errors
function tagToken_text(stepAllSubsections: string[], context: LessonParseTokenContext, parseResult: LessonParseResult) {
    const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token

    if(context.tokenArgs[0][0] != "/") { // opener tag
        // Step subsection defaults requirements
        if(tagTokenHelper_stepSubsections(stepAllSubsections, context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        context.thisNest.contents.push(context.tokenArgs[0]); // Add attributes to the parent nest
        context.currentNestLevels.push({nestLevel: context.tokenArgs[0], contents: []}); // Only needs to add nest level, evaluateTextToken() handles the rest
    }
    else { // closer tag
        // Basic nest level and args requirements for closing tags
        if(tagTokenHelper_closeTagGeneric(context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // [u] Check that a valid text token was detected in this nest
        if(context.thisNest.contents.length == 0) { // Will contain "valid_node" if text was detected
            parseResult.warnings.push(newDebugMessage("Empty " + token + " section detected. Ensure that text-based sections contain at least one non-whitespace character. This section has been ignored.", context, 0)); //TBC DOCUMENTATION: SECTIONS
            context.currentNestLevels[context.currentNestLevels.length - 2].contents.pop(); // Deletes the respective element from contents of parent node, 'ignoring' the section.
        }

        context.currentNestLevels.pop(); // Remove nestLevel
    }
}

// Covers the base requirements subsections for steps/defaultss, making use of a list of all possible subsections.
// - Checks for potentially missing closing tags from other step subsections
// - Nest level is step or defaults
// - No arguments
// - Uniqueness (depends on settings context)
function tagTokenHelper_stepSubsections(stepSubsections: string[], context: LessonParseTokenContext, parseResult: LessonParseResult) : boolean {
    // [u] Check for mistyped closer tag
    if(tagTokenHelper_mistypedCloserCheck(context, parseResult)) {
        return true;
    }

    // [u] Check for missing closing tags of other step-specific subsections
    if(tagTokenHelper_subsectionMissingCloserCheck(stepSubsections, context, parseResult)) {
        return true;
    }
    
    // Nest Level Requirement: step or defaults
    if(context.thisNest.nestLevel != "step") {
        // Unique message for text due to it also being valid within <hint>
        if(context.tokenArgs[0] == "text") {
            parseResult.warnings.push(newDebugMessage("Invalid positioning for Text subsection tag: <" + context.tokenArgs.join(" ") + ">, found in '" + context.thisNest.nestLevel.split("_")[0] + "' section. Text subsections can only be placed within <step> or <hint> subsections. If you are trying to write a comment, use <#></#>. This tag will be ignored.", context, 0));
        }
        else {
            parseResult.warnings.push(newDebugMessage("Invalid positioning for Step subsection tag: <" + context.tokenArgs.join(" ") + ">, found in '" + context.thisNest.nestLevel.split("_")[0] + "' section. Step subsections should only be contained within a <step> section. This tag will be ignored.", context, 0));
        }
        return true;
    }

    // Arguments Requirment: no args
    tagTokenHelper_noArgsGeneric(context, parseResult);
    
    // Uniqueness Requirement: one per parent section
    if(context.thisNest.contents.includes(context.tokenArgs[0])) {
        if(context.config.ALLOW_MULTIPLE_STEP_SUBSECTIONS) {
            parseResult.suggestions.push(newDebugMessage("Multiple <" + context.tokenArgs[0] + "> subsections in one Step. It is advised to only have at most one of each subsection per Step. Consider merging these two sections into one.", context, 0)); //TBC DOCUMENTATION: SECTIONS
        }
        else {
            parseResult.ERRORS.push(newDebugMessage("FATAL - Multiple <" + context.tokenArgs[0] + "> sections within one Step. Please merge duplicate subsections into one per step.", context, 0)); //TBC DOCUMENTATION: SECTIONS
            parseResult.success = false;
            return true;
        }
    }

    return false;
}

///////////////////////////////////////////////////////
// --- STEP ATTRIBUTES - 'root/step/attributes/' --- //
///////////////////////////////////////////////////////
// All contents inside the Attributes section, being argument-based tags that modify data about steps.

// Attribute to determine the colour scheme of a step panel.
function tagToken_colourScheme(context: LessonParseTokenContext, parseResult: LessonParseResult) {
    const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token
    const currentStep = (context.thisNest.nestLevel == "defaults")
        ? context.defaultsStepTemplate                     // this tag is inside <defaults>
        : parseResult.steps[parseResult.steps.length - 1]; // this tag is inside the most recent <step> (unless the placement is invalid)

    if(context.tokenArgs[0][0] != "/") { // opener tag
        // Basic nest level and uniqueness requirements for fixed argument attributes
        if(tagTokenHelper_stepAttributeNestUnique(context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // Argument Requirement: 1
        if(tagTokenHelper_fixedArgsGeneric(1, context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // [u] Unknown argument which does not match any valid inputs
        if(!fetchValidParameters("colour-scheme").includes(context.tokenArgs[1].toLowerCase())) {
            parseResult.warnings.push(newDebugMessage("Unknown Colour Scheme argument: " + token + ". Refer to the documentation for a list of valid arguments. This tag will be ignored and the Step will keep its defaults Colour Scheme.", context, 0));
            return;
        }
        
        currentStep.colourScheme = context.tokenArgs[1].toLowerCase(); // Updates by reference

        context.thisNest.contents.push(context.tokenArgs[0]); // Add to the parent nest
    }
    else { // closer tag
        // This tag type has no need for a closer tag, and therefore is disregarded
        tagTokenHelper_noCloseTagNeeded(context, parseResult);
    }
}

// Boolean Attribute defining whether the Requirement Message popover should hide the expected value.
function tagToken_hideExpectedValues(context: LessonParseTokenContext, parseResult: LessonParseResult) {
    const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token
    const currentStep = (context.thisNest.nestLevel == "defaults")
        ? context.defaultsStepTemplate                     // this tag is inside <defaults>
        : parseResult.steps[parseResult.steps.length - 1]; // this tag is inside the most recent <step> (unless the placement is invalid)

    if(context.tokenArgs[0][0] != "/") { // opener tag
        // Basic nest level and uniqueness requirements for fixed argument attributes
        if(tagTokenHelper_stepAttributeNestUnique(context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // Argument Requirements: nothing, or either true or false
        tagTokenHelper_stepAttributeBooleanArguments(context, parseResult);
        
        if(context.tokenArgs.length == 0 || context.tokenArgs[1].toLowerCase() == "true") {
            // No args = true
            currentStep.hideRequirementExpectedValues = true;
        }
        else if(context.tokenArgs[1].toLowerCase() == "false") {
            if(!currentStep.hideRequirementExpectedValues) {
                parseResult.suggestions.push(newDebugMessage("Unnecessary boolean attribute tag: " + token + ". This tag is paired to a value that was already false. Boolean argument attributes are false by defaults.", context, 0));
            }
            currentStep.hideRequirementExpectedValues = false;
        }

        context.thisNest.contents.push(context.tokenArgs[0]); // Add to the parent nest
    }
    else { // closer tag
        // This tag type has no need for a closer tag, and therefore is disregarded
        tagTokenHelper_noCloseTagNeeded(context, parseResult);
    }
    // EXTRA MESSAGES IN STEP CLOSER CHECKS:
    // - No hints to make up for hidden guidance
}

// Attribute to determine the panel type of a step (where the panel is displayed in the editor)
function tagToken_panelType(context: LessonParseTokenContext, parseResult: LessonParseResult) {
    const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token
    const currentStep = (context.thisNest.nestLevel == "defaults")
        ? context.defaultsStepTemplate                     // this tag is inside <defaults>
        : parseResult.steps[parseResult.steps.length - 1]; // this tag is inside the most recent <step> (unless the placement is invalid)

    if(context.tokenArgs[0][0] != "/") { // opener tag
        // Basic nest level and uniqueness requirements for fixed argument attributes
        if(tagTokenHelper_stepAttributeNestUnique(context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // Argument Requirement: 1
        if(tagTokenHelper_fixedArgsGeneric(1, context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        //Mapping of each parameter input to its ENUM type
        const panelArgMap: Record<string, StepPanelType> = {
            "popup-left": StepPanelType.LEFT_POPUP,
            "popup-right": StepPanelType.RIGHT_POPUP,
            "bar": StepPanelType.BOTTOM_WIDTH,
            "central-focus": StepPanelType.FULLSCREEN_FOCUS_MODAL,
        };

        // [u] Unknown argument which does not match any of the keywords above
        if(!panelArgMap[context.tokenArgs[1].toLowerCase()]) {
            parseResult.warnings.push(newDebugMessage("Unknown Panel Type argument: " + token + ". Refer to the documentation for a list of valid arguments. This tag will be ignored and the Step will keep its defaults Panel Type.", context, 0));
            return;
        }
        
        currentStep.panelType = panelArgMap[context.tokenArgs[1].toLowerCase()]; // Updates by reference

        context.thisNest.contents.push(context.tokenArgs[0]); // Add to the parent nest
    }
    else { // closer tag
        // This tag type has no need for a closer tag, and therefore is disregarded
        tagTokenHelper_noCloseTagNeeded(context, parseResult);
    }
    // EXTRA MESSAGES IN STEP CLOSER CHECKS:
    // - Size incompatability with too much text for certain panel types
    // - central-focus type should not allow requirements due to it covering the editor
}

// Covers the base requirements for unique step attributes that take an argument:
// - Inside <attributes> (unless setting allows otherwise).
// - Only one of this attribute specification within the current step.
// Returns 'true' when evaluateTagToken() needs to return early (ignore the tag).
function tagTokenHelper_stepAttributeNestUnique(context: LessonParseTokenContext, parseResult: LessonParseResult) : boolean {
    // Nest Level Requirement: defaults, attributes, or just step if ALLOW_ATTRIBUTES_IN_STEP_NEST == true.
    if(context.thisNest.nestLevel != "attributes" && context.thisNest.nestLevel != "defaults") {
        if(context.config.ALLOW_ATTRIBUTES_IN_STEP_NEST && context.thisNest.nestLevel == "step") {
            parseResult.suggestions.push(newDebugMessage("Unnested Attribute tag: <" + context.tokenArgs.join(" ") + ">. For better code organisation, consider grouping all Attribute tags within the <attributes> section.", context, 0, "", ""));
        }
        else {
            parseResult.warnings.push(newDebugMessage("Invalid positioning for Attribute tag: <" + context.tokenArgs.join(" ") + ">, found in '" + context.thisNest.nestLevel.split("_")[0] + "' section. Attributes should be stored within a Step's <attributes> section. This tag will be ignored.", context, 0, "", ""));
            return true;
        }
    }

    // Uniqueness Requirement: one per parent section. Also checks the step in case attributes were validly placed outside of the <attributes> section.
    if(context.thisNest.contents.includes(context.tokenArgs[0]) || context.currentNestLevels[1].contents.includes(context.tokenArgs[0])) {
        parseResult.warnings.push(newDebugMessage("Multiple instances of Attribute tag within one section: <" + context.tokenArgs[0] + ">. Only the first valid instance of an Attribute tag will be used. This tag will be ignored.", context, 0)); //TBC DOCUMENTATION: ATTRIBUTES
        return true;
    }

    return false;
}

// Covers the argument requirements for attributes with boolean data, allowing 0-1 arguments
function tagTokenHelper_stepAttributeBooleanArguments(context: LessonParseTokenContext, parseResult: LessonParseResult) {
    // Arguments Requirment: 0 or 1, but can only be true or false. 0 args defaults to true.
    if(context.tokenArgs.length > 2) {
        parseResult.warnings.push(newDebugMessage("Unnecessary arguments found within Attribute tag: <" + context.tokenArgs.join(" ") + ">. This tag only takes 1 argument at most. Excess arguments will be ignored.", context, 0));
    }
    if(context.tokenArgs.length > 1) {
        if(context.tokenArgs[1].toLowerCase() != "true" && context.tokenArgs[1].toLowerCase() != "false") {
            parseResult.warnings.push(newDebugMessage("Unknown argument '" + context.tokenArgs[1] + "' for Attribute tag: <" + context.tokenArgs[0] + ">. This tag only accepts 'true' or 'false'. This tag will assume no arguments are present and set its value to 'true'.", context, 0));
        }
    }
}

/////////////////////////////////////////////
// --- STEP HINTS - 'root/step/hints/' --- //
/////////////////////////////////////////////
// Guidance messages that activate based on specified requirements (requirements found in the next section)

// Main enclosing section for a single step, taking a stepRef as an argument and containing all step subsections
function tagToken_hint(context: LessonParseTokenContext, parseResult: LessonParseResult) {
    const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token
    const currentStep = parseResult.steps[parseResult.steps.length - 1];

    if(context.tokenArgs[0][0] != "/") { // opener tag
        // [u] Nest level is hint already - likely forgotten closing tag from previous hint
        if(context.thisNest.nestLevel == "hint") {
            if(context.config.CONTINUE_FROM_MISSING_CLOSER) {
                parseResult.ERRORS.push(newDebugMessage("Likely missing Hint closing tag </hint>. All section-based tags, including Hints, must have a closer.", context, -1)); //TBC DOCUMENTATION: SECTIONS
                
                // Attempts to resolve the issue by removing the step nestLevel and continuing. Only continues to scan for more errors for convenience.
                context.currentNestLevels.pop();
                context.thisNest = context.currentNestLevels[context.currentNestLevels.length - 1];
            }
            else {
                parseResult.ERRORS.push(newDebugMessage("FATAL - Likely missing Hint closing tag </hint>. All section-based tags, including Hints, must have a closer.", context, -1)); //TBC DOCUMENTATION: SECTIONS
                parseResult.success = false;
                return;
            }
        }

        // Nest Level Requirement: hint-list, or step if allowed
        if(context.thisNest.nestLevel != "hint-list") {
            if(context.thisNest.nestLevel == "step" && context.config.ALLOW_HINTS_IN_STEP_NEST) {
                // Hint is valid in this case, but when there's more than one hint in a step, a suggestion to group them is given.
                if(currentStep.hints.length > 0) {
                    parseResult.suggestions.push(newDebugMessage("Consider grouping multiple Hints within one Step into a <hint-list> section for better code organisation.", context, 0));
                }
            }
            else {
                parseResult.warnings.push(newDebugMessage("Invalid positioning for Hint tag: " + token + ", found in '" + context.thisNest.nestLevel.split("_")[0] + "' section. Hints should be nested inside a Step's <hint-list> section. This tag will be ignored.", context, 0));
                return;
            }
        }

        // [u] Maximum amount of hints in one step
        if(currentStep.hints.length >= context.config.MAX_HINTS_PER_STEP) {
            parseResult.warnings.push(newDebugMessage("Maximum Hints for one Step reached. Steps are limited to " + context.config.MAX_HINTS_PER_STEP + " total Hints. Consider merging some Hints together or spreading them across multiple Steps. All further <hint> tags in this Step will be ignored.", context, 0)); //TBC DOCUMENTATION: GENERAL LESSON RULES?
            return;
        }

        // Arguments Requirment: none
        tagTokenHelper_noArgsGeneric(context, parseResult);
        
        // Successful tag if this point is reached - update relevant data
        currentStep.hints.push({
            message: context.config.PLACEHOLDER_TEXT, 
            requirements: [],
        });
        
        context.thisNest.contents.push(context.tokenArgs[0]); // Add to the parent nest
        context.currentNestLevels.push({nestLevel: context.tokenArgs[0], contents: []}); // Add nest level
    }
    else { // closer tag TBC LOADS OF POST STEP COMPLETION CHECKS
        // Basic nest level and args requirements for closing tags
        if(tagTokenHelper_closeTagGeneric(context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // [u] hints should have custom message as a minimum
        if(currentStep.hints[currentStep.hints.length - 1].message == context.config.PLACEHOLDER_TEXT || currentStep.hints[currentStep.hints.length - 1].message == "") {
            parseResult.warnings.push(newDebugMessage("Hint is missing valid message content. Ensure either the hint has a non-empty <message> section. This hint section will be ignored.", context, 0)); //TBC DOCUMENTATION: MESSAGE
            currentStep.hints.pop(); // Delete empty hint
        }

        context.currentNestLevels.pop(); // Remove nestLevel
    }
    // EXTRA MESSAGES IN END OF FILE CHECKS:
    // - Too few steps
}

// [HINT VARIANT] Requirements section for setting Conditions to display a hint
function tagToken_requirements_inHint(context: LessonParseTokenContext, parseResult: LessonParseResult) {
    //const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token

    if(context.tokenArgs[0][0] != "/") { // opener tag
        // Nest Level Requirement: hint
        // Based on the logic of the parser, this method will only be called when the nest level is correct. Otherwise, it will call the primary variant

        // Arguments Requirment: no args
        tagTokenHelper_noArgsGeneric(context, parseResult);
        
        // Uniqueness Requirement: one per parent section
        if(context.thisNest.contents.includes(context.tokenArgs[0])) {
            if(context.config.ALLOW_MULTIPLE_STEP_SUBSECTIONS) { // This is too niche of a situation to have as its own config flag, so it just uses context.config.ALLOW_MULTIPLE_STEP_SUBSECTIONS instead
                parseResult.suggestions.push(newDebugMessage("Multiple <requirements> subsections in one Hint. It is advised to only have at most one of each subsection per Hint. Consider merging these two sections into one.", context, 0)); //TBC DOCUMENTATION: SECTIONS
            }
            else {
                parseResult.ERRORS.push(newDebugMessage("Multiple <requirements> sections within one Hint. Please merge duplicate subsections into one per Hint.", context, 0)); //TBC DOCUMENTATION: SECTIONS
            }
        }

        context.thisNest.contents.push(context.tokenArgs[0]); // Add attributes to the parent nest
        context.currentNestLevels.push({nestLevel: context.tokenArgs[0] + "_inHint", contents: []}); // VARIANT NEST
    }
    else { // closer tag
        // Basic nest level and args requirements for closing tags
        if(tagTokenHelper_closeTagGeneric(context, parseResult, "_inHint")) {
            return; // ^ If true, tag needs to be ignored
        }

        // [u] Empty section
        if(context.thisNest.contents.length == 0) {
            parseResult.warnings.push(newDebugMessage("Hint Requirements section has no content. This section will be ignored", context, 0));

            // Remove this section from the contents of the parent nest
            context.currentNestLevels[context.currentNestLevels.length - 2].contents.pop();
        }

        context.currentNestLevels.pop(); // Remove nestLevel
    }
}

// [HINT VARIANT] Text subsection which contains the displayed text for an individual hint
function tagToken_text_inHint(context: LessonParseTokenContext, parseResult: LessonParseResult) {
    const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token

    if(context.tokenArgs[0][0] != "/") { // opener tag
        // Nest Level Requirement: hint
        // Based on the logic of the parser, this method will only be called when the nest level is correct. Otherwise, it will call the primary variant

        // Arguments Requirment: no args
        tagTokenHelper_noArgsGeneric(context, parseResult);
        
        // Uniqueness Requirement: one per parent section
        if(context.thisNest.contents.includes(context.tokenArgs[0])) {
            parseResult.ERRORS.push(newDebugMessage("FATAL - Multiple <message> sections within one Hint. Only one Message is displayed per Hint. To display multiple messages, make use of multiple <hint> sections with varying Requirements.", context, 0)); //TBC DOCUMENTATION: HINT
            parseResult.success = false;
            return true;
        }

        context.thisNest.contents.push(context.tokenArgs[0]); // Add attributes to the parent nest
        context.currentNestLevels.push({nestLevel: context.tokenArgs[0] + "_inHint", contents: []});  // VARIANT NEST
    }
    else { // closer tag

        // Basic nest level and args requirements for closing tags
        if(tagTokenHelper_closeTagGeneric(context, parseResult, "_inHint")) {
            return; // ^ If true, tag needs to be ignored
        }

        // [u] Check that a valid text token was detected in this nest
        if(context.thisNest.contents.length == 0) { // Will contain "valid_node" if text was detected
            parseResult.warnings.push(newDebugMessage("Empty " + token + " section detected. Ensure that text-based sections contain at least one non-whitespace character. This section has been ignored.", context, 0)); //TBC DOCUMENTATION: SECTIONS
            context.currentNestLevels[context.currentNestLevels.length - 2].contents.pop(); // Deletes the respective element from contents of parent node, 'ignoring' the section.
        }

        context.currentNestLevels.pop(); // Remove nestLevel
    }
}

////////////////////////////////////////////////////////////////
// --- STEP/HINT REQUIREMENTS - 'root/step/requirements/' --- // TBC: REQUIREMENT LIMITS
////////////////////////////////////////////////////////////////
// Different types of Requirements that must be fulfilled to proceed to the next step (or to show a hint if used in a <hint> section)

// Failed Attempts Requirement for hints. Makes a hint display after a certain amount of failed attempts to go to the next step (from other unfulfilled requirements)
function tagToken_failedAttempts(context: LessonParseTokenContext, parseResult: LessonParseResult) {
    const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token
    const currentStep = parseResult.steps[parseResult.steps.length - 1];

    if(context.tokenArgs[0][0] != "/") { // opener tag
        // Nest Level Requirement: ONLY hint. This requirement type is not allowed to be used on steps.
        if(context.thisNest.nestLevel != "hint" && context.thisNest.nestLevel != "requirements_inHint") {
            if(context.thisNest.nestLevel == "requirements" || (context.thisNest.nestLevel == "step" && context.config.ALLOW_REQUIREMENTS_IN_STEP_NEST)) {
                parseResult.warnings.push(newDebugMessage("Invalid positioning for Requirement tag: <" + context.tokenArgs[0] + ">, found in '" + context.thisNest.nestLevel.split("_")[0] + "' section. This Requirement type is not allowed to be used for Steps. It can only be placed inside a <hint> section for conditionally displaying Hints. This tag will be ignored.", context, 0, "", ""));
            }
            else {
                parseResult.warnings.push(newDebugMessage("Invalid positioning for Requirement tag: <" + context.tokenArgs[0] + ">, found in '" + context.thisNest.nestLevel.split("_")[0] + "' section. This Requirement type can only be placed inside a <hint> section for conditionally displaying Hints. This tag will be ignored.", context, 0));
            }
            return;
        }

        // Arguments Requirment: one positive number value
        if(tagTokenHelper_fixedArgsGeneric(1, context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // [u] Argument restrictions: must be a positive integer, should be close to 0
        if(context.tokenArgs[1] == "0" || !(/^\d+$/.test(context.tokenArgs[1]))) { // '^\d+$' is a Positive Integer Regex, allowing strings that only contain digits 0-9 (no . or -)
            parseResult.warnings.push(newDebugMessage("Invalid argument: " + token + ". This tag only accepts integers greater than 0 as an argument. This tag will be ignored.", context, 0));
            return;
        }
        if(Number(context.tokenArgs[1]) > context.config.MAX_REQ_ARG_FAILED_ATTEMPTS) {
            if(context.config.ALLOW_REQUIREMENTS_ABOVE_MAX_VALUES) {
                parseResult.suggestions.push(newDebugMessage("This tag has an unusually high argument value: " + token + ". It is recommended to stay below " + context.config.MAX_REQ_ARG_FAILED_ATTEMPTS + " for a better learning experience.", context, 0));
            }
            else {
                parseResult.warnings.push(newDebugMessage("Invalid argument: " + token + ". The maximum value for this argument is " + context.config.MAX_REQ_ARG_FAILED_ATTEMPTS + ". This tag will be ignored.", context, 0));
                return;
            }
        }

        // Uniqueness Requirement: one per parent section
        if(context.thisNest.contents.includes(context.tokenArgs[0])) {
            parseResult.warnings.push(newDebugMessage("Multiple <" + context.tokenArgs[0] + "> Requirements in one section. Only the first instance of this Requirement will be used. This tag will be ignored.", context, 0));
            return;
        }

        // [u] Maximum requirements check
        if(currentStep.hints[currentStep.hints.length - 1].requirements.length == context.config.MAX_REQUIREMENTS_PER_HINT) {
            parseResult.warnings.push(newDebugMessage("Maximum Hint Requirements reached at " + token + "Hints are limited to " + context.config.MAX_REQUIREMENTS_PER_HINT + " Requirements at most. This tag will be ignored.", context, 0));
            return;
        }

        // Create the Requirement (guaranteed to be hint)
        currentStep.hints[currentStep.hints.length - 1].requirements.push({
            reqType: StepRequirementType.FAILED_ATTEMPTS, 
            needed: false,
            numValue: Number(context.tokenArgs[1]),
        });

        context.thisNest.contents.push(context.tokenArgs[0]); // Add to the parent nest step/defaults
    }
    else { // closer tag
        // This tag type has no need for a closer tag, and therefore is disregarded
        tagTokenHelper_noCloseTagNeeded(context, parseResult);
    }
    // EXTRA MESSAGES IN STEP CLOSER CHECKS:
    // - No step requirements to trigger this
}

// Run Code Requirement, needing the user to click the run code button before progressing
function tagToken_runCode(context: LessonParseTokenContext, parseResult: LessonParseResult) {
    const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token
    const currentStep = parseResult.steps[parseResult.steps.length - 1];

    if(context.tokenArgs[0][0] != "/") { // opener tag
        // Nest Level Requirement: requirements, hint, or step if allowed
        if(tagTokenHelper_requirementNestLevel(context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // Arguments Requirment: no args
        tagTokenHelper_noArgsGeneric(context, parseResult);

        // Uniqueness Requirement: one per parent section
        if(context.thisNest.contents.includes(context.tokenArgs[0])) {
            parseResult.warnings.push(newDebugMessage("Multiple <" + context.tokenArgs[0] + "> Requirements in one section. Having multiple of this tag has no effect on the Requirement. This tag will be ignored.", context, 0));
            return;
        }

        // Create the Requirement
        if(context.thisNest.nestLevel == "hint" || context.thisNest.nestLevel == "requirements_inHint") {
            // [u] Maximum requirements check (hint)
            if(currentStep.hints[currentStep.hints.length - 1].requirements.length == context.config.MAX_REQUIREMENTS_PER_HINT) {
                parseResult.warnings.push(newDebugMessage("Maximum Hint Requirements reached at " + token + ". Hints are limited to " + context.config.MAX_REQUIREMENTS_PER_HINT + " Requirements at most. This tag will be ignored.", context, 0));
                return;
            }

            currentStep.hints[currentStep.hints.length - 1].requirements.push({
                reqType: StepRequirementType.RUN_CODE, 
                needed: false,
            });
        }
        else { // nest = requirements or step
            // [u] Maximum requirements check (step)
            if(currentStep.requirements.length == context.config.MAX_REQUIREMENTS_PER_STEP) {
                parseResult.warnings.push(newDebugMessage("Maximum Step Requirements reached at " + token + ". Steps are limited to " + context.config.MAX_REQUIREMENTS_PER_STEP + " Requirements at most. This tag will be ignored.", context, 0));
                return;
            }

            currentStep.requirements.push({
                reqType: StepRequirementType.RUN_CODE, 
                needed: false,
                // No textValue or numValue needed for this type
            });
        }

        context.thisNest.contents.push(context.tokenArgs[0]); // Add to the parent nest step/defaults
    }
    else { // closer tag
        // This tag type has no need for a closer tag, and therefore is disregarded
        tagTokenHelper_noCloseTagNeeded(context, parseResult);
    }
}

// Time Passed Requirement, needing the user to spend a certain amount of seconds on a step
function tagToken_timePassed(context: LessonParseTokenContext, parseResult: LessonParseResult) {
    const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token
    const currentStep = parseResult.steps[parseResult.steps.length - 1];

    if(context.tokenArgs[0][0] != "/") { // opener tag
        // Nest Level Requirement: requirements, hint, or step if allowed
        tagTokenHelper_similarTagSuggestion(["metadata"], "estimated-time", context, parseResult, "", ""); //TBC DOCUMENTATION: TIME PASSED
        if(tagTokenHelper_requirementNestLevel(context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // Arguments Requirment: one positive number value
        if(tagTokenHelper_fixedArgsGeneric(1, context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // [u] Argument restrictions: must be a positive integer, should be close to 0
        if(context.tokenArgs[1] == "0" || !(/^\d+$/.test(context.tokenArgs[1]))) { // '^\d+$' is a Positive Integer Regex, allowing strings that only contain digits 0-9 (no . or -)
            parseResult.warnings.push(newDebugMessage("Invalid argument: " + token + ". This tag only accepts integers greater than 0 as an argument, measured in seconds. This tag will be ignored.", context, 0));
            return;
        }
        if(Number(context.tokenArgs[1]) > context.config.MAX_REQ_ARG_TIME_PASSED) {
            if(context.config.ALLOW_REQUIREMENTS_ABOVE_MAX_VALUES) {
                parseResult.suggestions.push(newDebugMessage("This tag has an unusually high argument value: " + token + ". It is recommended to stay below " + context.config.MAX_REQ_ARG_TIME_PASSED + " seconds for a better learning experience.", context, 0));
            }
            else {
                parseResult.warnings.push(newDebugMessage("Invalid argument: " + token + ". The maximum value for this argument is " + context.config.MAX_REQ_ARG_TIME_PASSED + " seconds. This tag will be ignored.", context, 0));
                return;
            }
        }

        // Uniqueness Requirement: one per parent section
        if(context.thisNest.contents.includes(context.tokenArgs[0])) {
            parseResult.warnings.push(newDebugMessage("Multiple <" + context.tokenArgs[0] + "> Requirements in one section. Only the first instance of this Requirement will be used. This tag will be ignored.", context, 0));
            return;
        }

        // Create the Requirement
        if(context.thisNest.nestLevel == "hint" || context.thisNest.nestLevel == "requirements_inHint") {
            // [u] Maximum requirements check (hint)
            if(currentStep.hints[currentStep.hints.length - 1].requirements.length == context.config.MAX_REQUIREMENTS_PER_HINT) {
                parseResult.warnings.push(newDebugMessage("Maximum Hint Requirements reached at " + token + ". Hints are limited to " + context.config.MAX_REQUIREMENTS_PER_HINT + " Requirements at most. This tag will be ignored.", context, 0));
                return;
            }

            currentStep.hints[currentStep.hints.length - 1].requirements.push({
                reqType: StepRequirementType.TIME_PASSED, 
                needed: false,
                numValue: Number(context.tokenArgs[1]),
            });
        }
        else { // nest = requirements or step
            // [u] Maximum requirements check (step)
            if(currentStep.requirements.length == context.config.MAX_REQUIREMENTS_PER_STEP) {
                parseResult.warnings.push(newDebugMessage("Maximum Step Requirements reached at " + token + ". Steps are limited to " + context.config.MAX_REQUIREMENTS_PER_STEP + " Requirements at most. This tag will be ignored.", context, 0));
                return;
            }

            currentStep.requirements.push({
                reqType: StepRequirementType.TIME_PASSED, 
                needed: false,
                numValue: Number(context.tokenArgs[1]),
            });
        }

        context.thisNest.contents.push(context.tokenArgs[0]); // Add to the parent nest step/defaults
    }
    else { // closer tag
        // This tag type has no need for a closer tag, and therefore is disregarded
        tagTokenHelper_noCloseTagNeeded(context, parseResult);
    }
}

// Covers the nest requirement for Requirement tags.
// - Inside either the <requirements> section of a step, or inside a <hint>
// - If neither, check if its inside a step, as this might be allowed too and assumed as a step requirement
function tagTokenHelper_requirementNestLevel(context: LessonParseTokenContext, parseResult: LessonParseResult) : boolean {
    if(!["requirements", "hint", "requirements_inHint"].includes(context.thisNest.nestLevel)) {
        if(context.thisNest.nestLevel == "step" && context.config.ALLOW_REQUIREMENTS_IN_STEP_NEST) {
            parseResult.suggestions.push(newDebugMessage("Unnested Requirement tag: <" + context.tokenArgs.join(" ") + ">. This Requirement will be assumed as a Step Requirement. For better code organisation, consider grouping all Requirement tags within the <requirements> section.", context, 0, "", ""));
        }
        else {
            parseResult.warnings.push(newDebugMessage("Invalid positioning for Requirement tag: <" + context.tokenArgs[0] + ">, found in '" + context.thisNest.nestLevel.split("_")[0] + "' section. Requirements are assigned within a Step's <requirements> section, or inside a <hint> section to assign it to that Hint. This tag will be ignored.", context, 0));
            return true;
        }
    }

    return false;
}