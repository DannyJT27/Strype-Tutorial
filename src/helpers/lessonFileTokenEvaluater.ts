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

// Context object storing all info needed for tag token evaluation methods (previous method implementation had 9+ parameter functions which is not good)

interface LessonParseTokenContext {
    // Store of <default> step, which can be modified
    defaultStepTemplate: LessonStepDetails;

    // Breakdown of token into individual words
    tokenArgs: string[];

    // Nest level related data for the parser to track
    currentNestLevels: LessonParseNestSection[];
    thisNest: LessonParseNestSection;
    rootNest: LessonParseNestSection; // Stores either 'step' or 'default'

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
export function evaluateTextToken(token: string, nestLevels: LessonParseNestSection[], currentLineNum: number, parseResult: LessonParseResult, initialDefaultStep: LessonStepDetails, parserConfig: LessonParserConfiguration) : void {
    // -- SPECIAL FAILSAFE -- 
    if(nestLevels.length == 0) { // "base_nest" has somehow been popped
        // This should never be encountered by a user, but this will break a LOT of stuff if it happens to occur, so this is mainly for debugging.
        nestLevels.push({nestLevel: "base_nest", contents: []});
        console.error("Lesson Error: 'base_nest' was somehow popped. There is a major fault with the parser.");
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
        // These elements should NOT be edited beyond initialization
        tokenArgs: [], // textTokens do not require this
        rootNest: nestLevels.length > 1 ? nestLevels[1] : nestLevels[0], // Used to distinguish between <default> and <step> (index 0 is base_nest)
        lineNum: currentLineNum,
        stepRef: parseResult.steps.length > 0 ? parseResult.steps[parseResult.steps.length - 1].stepRef : "", //Obtain stepRef from parseResult
        config: parserConfig,

        // These elements likely will be edited
        docText: "", // Used to store a tag's specific documentation info, which will be used in most debug messages unless another page is more important
        docLink: "",
        currentNestLevels: nestLevels,
        thisNest: nestLevels[nestLevels.length - 1],
        defaultStepTemplate: initialDefaultStep, // Modified by <default>, cloned by <step>
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
        // Text token is on base_nest, meaning it is not in any sections
        parseResult.ERRORS.push(newDebugMessage("FATAL - Unsectioned text segment: '" + (token.length > 32 ? (token.slice(0, 32) + "...") : token) + "' To add comments safely, please use the comment tags <#> </#>.", context, 0)); //TBC DOCUMENTATION: COMMENTS
        parseResult.success = false;
        return;
    }

    // Valid text tokens are stored between a single opening and closing tag. This means that the behaviour of this function can be sorted by the current nest level.
    // Similar to evaluateTagToken(), they are implemented in alphabetical order.
    // Same briefing about requirements and debug messages from evaluateTagToken() applies here too.

    // -- TEXT TOKEN HANDLING --

    // nest level "#" (comments) is handled in Silent Return cases

    ////////////////////////\\\\\\\\\\\\\\\\\\\\\\\\
    if(context.thisNest.nestLevel == "description") { 
        context.docText = "Lesson Description";
        context.docLink = "TBC DOCUMENTATION";

        // [u] Title isn't too long
        if(token.length > context.config.MAX_LENGTH_DESCRIPTION) {
            parseResult.warnings.push(newDebugMessage("Lesson Description shortened due to exceeding the character limit of " + context.config.MAX_LENGTH_DESCRIPTION + ".", context, 0, "", ""));
        }

        parseResult.details.title = token.slice(0, context.config.MAX_LENGTH_DESCRIPTION);
        context.thisNest.contents.push("valid_token"); // Indicator that there is a valid text token within this nest
        return;
    }

    ////////////////////////\\\\\\\\\\\\\\\\\\\\\\\\
    if(context.thisNest.nestLevel == "text") { 
        context.docText = "Step Text";
        context.docLink = "TBC DOCUMENTATION";

        if(context.rootNest.nestLevel != "step" && context.rootNest.nestLevel != "default") {
            // If the nest level is invalid, no error message is needed due to that already being displayed by the tag token evaluator
            return;
        }

        const currentStep = (context.rootNest.nestLevel == "step")
            ? parseResult.steps[parseResult.steps.length - 1]   // this token is inside the most recent <step>
            : context.defaultStepTemplate;                      // this token is inside <default>

        // Update the step
        currentStep.textContent = token;
        context.thisNest.contents.push("valid_token"); // Indicator that there is a valid text token within this nest
        return;
    }

    ////////////////////////\\\\\\\\\\\\\\\\\\\\\\\\
    if(context.thisNest.nestLevel == "text_inHint") { // HINT VARIANT OF <text>
        context.docText = "Step Hints";
        context.docLink = "TBC DOCUMENTATION";

        const currentStep = (context.rootNest.nestLevel == "step")
            ? parseResult.steps[parseResult.steps.length - 1]   // this token is inside the most recent <step>
            : context.defaultStepTemplate;                      // this token is inside <default>

        // [u] Text isn't too long
        if(token.length > context.config.MAX_LENGTH_DESCRIPTION) {
            parseResult.warnings.push(newDebugMessage("Hint Text '" + token.slice(0, 32) + "...' shortened due to exceeding the character limit of " + context.config.MAX_LENGTH_HINT_TEXT + ".", context, 0, "", ""));
        }

        // Update the hint
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
    parseResult.ERRORS.push(newDebugMessage("FATAL - Invalid location for text segment: '" + (token.length > 32 ? (token.slice(0, 32) + "...") : token) + "' Uncommented text segments cannot be included in the <" + context.thisNest.nestLevel + "> section. To add comments safely, please use the comment tags <#> </#>.", context, 0)); //TBC DOCUMENTATION: COMMENTS
    parseResult.success = false;
    return;    
}

// ----- TAG TOKENS -----

// Main token reader for tags, making changes to nestLevel and parseResult as required. This is the main handler for the language's syntax.
// Individual tag tokens have their own unique function for logic and debugging, named as tagToken_{token}().
export function evaluateTagToken(token: string, nestLevels: LessonParseNestSection[], currentLineNum: number, parseResult: LessonParseResult, initialDefaultStep: LessonStepDetails, parserConfig: LessonParserConfiguration) : void {
    // -- SPECIAL FAILSAFE -- 
    if(nestLevels.length == 0) { // "base_nest" has somehow been popped
        // This should never be encountered by a user, but this will break a LOT of stuff if it happens to occur, so this is mainly for debugging.
        nestLevels.push({nestLevel: "base_nest", contents: []});
        console.error("Lesson Error: 'base_nest' was somehow popped. There is a major fault with the parser.");
    }
    
    // -- INIT --
    const context: LessonParseTokenContext = {
        // These elements should NOT be edited beyond initialization
        tokenArgs: token.slice(1, -1).split(" "), // Removes the < and >, and then splits by space
        rootNest: nestLevels.length > 1 ? nestLevels[1] : nestLevels[0], // Used to distinguish between <default> and <step> (index 0 is base_nest)
        lineNum: currentLineNum,
        stepRef: parseResult.steps.length > 0 ? parseResult.steps[parseResult.steps.length - 1].stepRef : "", //Obtain stepRef from parseResult
        config: parserConfig,

        // These elements will be edited
        docText: "", // Used to store a tag's specific documentation info, which will be used in most debug messages unless another page is more important
        docLink: "",
        currentNestLevels: nestLevels,
        thisNest: nestLevels[nestLevels.length - 1],
        defaultStepTemplate: initialDefaultStep, // Modified by <default>, cloned by <step>
    };
  
    // Lists of all potentially missing closing tags in various nest levels, mainly used for detecting commonly missing closing tags and working around them them
    const stepAllSubsections = ["text", "attributes", "requirements", "hints", "req"];
    const metadataAllSubsections = ["title", "description", "project-name"];

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

    if(context.tokenArgs[0] == "default" || context.tokenArgs[0] == "/default") { 
        context.docText = "Default";
        context.docLink = "TBC DOCUMENTATION";
        tagToken_default(context, parseResult);
        return;
    }

    if(context.tokenArgs[0] == "description" || context.tokenArgs[0] == "/description") {
        context.docText = "Lesson Description";
        context.docLink = "TBC DOCUMENTATION";
        tagToken_description(metadataAllSubsections, context, parseResult);
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
        tagToken_metadata(metadataAllSubsections, context, parseResult);
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
        tagToken_step(context, parseResult);
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
        tagToken_title(metadataAllSubsections, context, parseResult);
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

// Covers the two main default requirements for (almost?) all closing tags:
// - No arguments
// - Valid opening tag (checked by nest level)
// Returns 'true' when evaluateTagToken() needs to return early (ignore the tag).
function tagTokenHelper_closeTagGeneric(context: LessonParseTokenContext, parseResult: LessonParseResult, variantSuffix?: string) : boolean {
    // Variant suffix is used to modify the required nest level for Variant tags (for example text_inHint)

    // Nest Level Requirement: same as the token name without the / (e.g. /text requires text)
    if(context.thisNest.nestLevel != context.tokenArgs[0].slice(1) + (variantSuffix ?? "")) { //slice(1) removes the /
        parseResult.warnings.push(newDebugMessage("Invalid positioning for closing tag: <" + context.tokenArgs.join(" ") + ">. No valid paired opening tag is detected. This tag will be ignored.", context, 0)); //TBC DOCUMENTATION
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
            parseResult.ERRORS.push(newDebugMessage("Likely missing closing tag </" + context.thisNest.nestLevel + ">. All section-based tags must have a closer. The parser will attempt to continue beyond this.", context, 0)); //TBC DOCUMENTATION: SECTIONS
            
            // Attempts to resolve the issue by removing the step nestLevel and continuing. Only continues to scan for more errors for convenience.
            context.currentNestLevels.pop();
            context.thisNest = context.currentNestLevels[context.currentNestLevels.length - 1];
        }
        else {
            parseResult.ERRORS.push(newDebugMessage("FATAL - Likely missing closing tag </" + context.thisNest.nestLevel + ">. All section-based tags must have a closer.", context, 0)); //TBC DOCUMENTATION: SECTIONS
            parseResult.success = false;
            return true;
        }
    }

    return false;
}

///////////////////////////////////////////
// --- METADATA DEFINITION - 'base/' --- //
///////////////////////////////////////////
// Definition of the Metadata section

// Lesson metadata section for details about the Lesson, such as its title and description
function tagToken_metadata(metadataAllSubsections: string[], context: LessonParseTokenContext, parseResult: LessonParseResult) {
    const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token

    if(context.tokenArgs[0][0] != "/") { // opener tag
        // Nest Level Requirement: base (no nesting)
        if(context.thisNest.nestLevel != "base_nest") {
            parseResult.warnings.push(newDebugMessage("Invalid positioning for Metadata tag: " + token + ". The Metadata section should not be nested in other sections. This tag will be ignored.", context, 0));
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

        // [u] Positioning within the file, checked via the contents of base_nest. Recommended to be at the top of the file before any steps or defaults.
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

        // [u] Closer check for metadata sections
        if(tagTokenHelper_subsectionMissingCloserCheck(metadataAllSubsections, context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // [u] Empty metadata section
        if(context.thisNest.contents.length == 0) {
            parseResult.warnings.push(newDebugMessage("Empty Metadata section detected. Refer to the documentation for a list of valid tags to be used within this section. This section will be ignored.", context, 0));
            
            // Remove this Metadata record from base_nest contents (will be most recent entry assuming valid opening tag)
            // Prevents a niche error case where user has an empty <metadata> section, and then a valid one right after. Ignoring this section will allow the parser to read the next one as valid.
            context.currentNestLevels[0].contents.pop();
        }

        context.currentNestLevels.pop(); // Remove nestLevel
    }
    // EXTRA MESSAGES IN END OF FILE CHECKS:
    // - No metadata section present
}

//////////////////////////////////////////////////
// --- METADATA CONTENTS - 'base/metadata/' --- //
//////////////////////////////////////////////////
// Contents of the Metadata section that affect the displayed information about a Lesson inside the 'Load Lesson' Modal.

// Description of the Lesson File, displayed at the beginning when starting the Lesson.
function tagToken_description(metadataAllSubsections: string[], context: LessonParseTokenContext, parseResult: LessonParseResult) {
    const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token

    if(context.tokenArgs[0][0] != "/") { // opener tag
        // Closer check for metadata sections
        if(tagTokenHelper_subsectionMissingCloserCheck(metadataAllSubsections, context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // Nest Level Requirement: metadata (or base_nest if allowed by ALLOW_METADATA_IN_BASE_NEST)
        if(context.thisNest.nestLevel == "base_nest" && context.config.ALLOW_METADATA_IN_BASE_NEST) {
            parseResult.suggestions.push(newDebugMessage("Consider placing " + token + " subsection within the Lesson's <metadata> section for better organisation.", context, 0));
        } 
        else if(context.thisNest.nestLevel != "metadata") {
            // Potential mistake between distinguishing <title> and <text>
            if(context.thisNest.nestLevel == "step" || context.thisNest.nestLevel == "default") {
                parseResult.suggestions.push(newDebugMessage("Lesson Description tag detected within <" + context.thisNest.nestLevel + "> section. Did you mean <text>?", context, 0)); //TBC DOCUMENTATION: TEXT
            }

            parseResult.warnings.push(newDebugMessage("Invalid positioning for Description tag: " + token + ". The Lesson's Description should be specified within the <metadata> section. This tag will be ignored.", context, 0));
            return;
        }

        // Arguments Requirment: no args with special informative message
        tagTokenHelper_noArgsGeneric(context, parseResult, "Unnecessary arguments found within tag: <" + context.tokenArgs.join(" ") + ">. These arguments will be ignored.");
    
        // [u] Check for whether description has already been modified (can't use normal nest.contents method due to potentially multiple metadata sections + non-nested descriptions)
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

// Title of the Lesson File (not the project name).
function tagToken_title(metadataAllSubsections: string[], context: LessonParseTokenContext, parseResult: LessonParseResult) {
    const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token

    if(context.tokenArgs[0][0] != "/") { // opener tag
        // [u] Closer check for metadata sections
        if(tagTokenHelper_subsectionMissingCloserCheck(metadataAllSubsections, context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // Nest Level Requirement: metadata (or base_nest if allowed by ALLOW_METADATA_IN_BASE_NEST)
        if(context.thisNest.nestLevel == "base_nest" && context.config.ALLOW_METADATA_IN_BASE_NEST) {
            parseResult.suggestions.push(newDebugMessage("Consider placing " + token + " subsection within the Lesson's <metadata> section for better organisation.", context, 0));
        } 
        else if(context.thisNest.nestLevel != "metadata") {
            // Potential mistake between distinguishing <title> and <text>
            if(context.thisNest.nestLevel == "step" || context.thisNest.nestLevel == "default") {
                parseResult.suggestions.push(newDebugMessage("Lesson Title tag detected within <" + context.thisNest.nestLevel + "> section. Did you mean <text>?", context, 0)); //TBC DOCUMENTATION: TEXT
            }

            parseResult.warnings.push(newDebugMessage("Invalid positioning for Title tag: " + token + ". The Lesson's Title should be specified within the <metadata> section. This tag will be ignored.", context, 0));
            return;
        }

        // Arguments Requirment: no args with special informative message
        tagTokenHelper_noArgsGeneric(context, parseResult, "Unnecessary arguments found within tag: <" + context.tokenArgs.join(" ") + ">. The Lesson Title is specified as a text section, not within tag arguments. These arguments will be ignored.");
    
        // [u] Check for whether title has already been modified (can't use normal nest.contents method due to potentially multiple metadata sections + non-nested titles)
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
// --- DEFAULT/STEP DEFINITION - 'base/' --- //
///////////////////////////////////////////////
// Definitions for Default and Step sections, which both take the same inputs for different results.

// Takes all the same information as <step>, updating the default values of aspects not changed by individual Step definitons
function tagToken_default(context: LessonParseTokenContext, parseResult: LessonParseResult) {
    const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token

    if(context.tokenArgs[0][0] != "/") { // opener tag
        // Nest Level Requirement: base (no nesting)
        if(context.thisNest.nestLevel != "base_nest") {
            parseResult.warnings.push(newDebugMessage("Invalid positioning for Default tag: " + token + ". Steps cannot be nested in any other sections. This tag will be ignored.", context, 0));
            return;
        }

        // Arguments Requirment: no args
        tagTokenHelper_noArgsGeneric(context, parseResult);
        
        // [u] lack of steps between this and the previous default specification
        if(context.thisNest.contents[context.thisNest.contents.length - 1] == "default") {
            parseResult.suggestions.push(newDebugMessage("Multiple Default sections with no Steps defined in between detected. Consider merging these into one <default> section.", context, 0));
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

        // [u] Empty Default section
        if(context.thisNest.contents.length == 0) {
            parseResult.suggestions.push(newDebugMessage("Empty Default section detected. No changes to the Default Step were made.", context, 0));
        }

        context.currentNestLevels.pop(); // Remove nestLevel
    }
    // EXTRA MESSAGES IN END OF FILE CHECKS:
    // - No steps beyond a default
}

// Main enclosing section for a single step, taking a stepRef as an argument and containing all step subsections
function tagToken_step(context: LessonParseTokenContext, parseResult: LessonParseResult) {
    const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token
    const totalSteps = parseResult.steps.length;

    if(context.tokenArgs[0][0] != "/") { // opener tag
        // [u] Nest level is step already - likely forgotten closing tag from previous step
        if(context.thisNest.nestLevel == "step") {
            if(context.config.CONTINUE_FROM_MISSING_CLOSER) {
                parseResult.ERRORS.push(newDebugMessage("Likely missing Step closing tag </step>. All section-based tags, including Steps, must have a closer.", context, -1)); //TBC DOCUMENTATION: SECTIONS
                
                // Attempts to resolve the issue by removing the step nestLevel and continuing. Only continues to scan for more errors for convenience.
                context.currentNestLevels.pop();
                context.thisNest = context.currentNestLevels[context.currentNestLevels.length - 1];
            }
            else {
                parseResult.ERRORS.push(newDebugMessage("FATAL - Likely missing Step closing tag </step>. All section-based tags, including Steps, must have a closer.", context, -1)); //TBC DOCUMENTATION: SECTIONS
                parseResult.success = false;
                return;
            }
        }

        // Nest Level Requirement: base (no nesting)
        if(context.thisNest.nestLevel != "base_nest") {
            parseResult.warnings.push(newDebugMessage("Invalid positioning for Step tag: " + token + ". Steps cannot be nested in any other sections. This tag will be ignored.", context, 0));
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
                // Replace stepRef with default when a duplicate is found
                newStepRef = "Unnamed Step #" + (totalSteps + 1);
                parseResult.warnings.push(newDebugMessage("Duplicate Step name, matching Step #" + (s + 1) + ": " + parseResult.steps[s].stepRef + ". Current Step has been renamed to '" + newStepRef + "'.", context, 0, "", ""));
                break;
            }
        }
        
        // Append the new step as a copy of defaultStep with the new stepRef
        const newStep = structuredClone(context.defaultStepTemplate); // Uses structuredClone to ensure new copies of object array attributes are created, for example the requirements list.
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

        // [u] steps should have custom text as a minimum
        if(parseResult.steps[totalSteps - 1].textContent == context.config.PLACEHOLDER_TEXT || parseResult.steps[totalSteps - 1].textContent == "") {
            parseResult.ERRORS.push(newDebugMessage("Step is missing valid text content. Ensure either the step has a non-empty <text> section, or that one is specified in <default>.", context, 0)); //TBC DOCUMENTATION: TEXT
        }

        context.currentNestLevels.pop(); // Remove nestLevel
        context.stepRef = ""; // Empties stepRef as the parser is no longer in a step - helps for debugging
    }
    // EXTRA MESSAGES IN END OF FILE CHECKS:
    // - Too few steps
}

/////////////////////////////////////////////
// --- STEP SUBSECTIONS - 'base/step/' --- //
/////////////////////////////////////////////
// All main subsections in a single step, grouping its respective data accordingly

// Attributes subsection for specifying most data about a specific step / default
function tagToken_attributes(stepAllSubsections: string[], context: LessonParseTokenContext, parseResult: LessonParseResult) {
    //const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token

    if(context.tokenArgs[0][0] != "/") { // opener tag
        // Step subsection default requirements
        if(tagTokenHelper_stepSubsections(stepAllSubsections, context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        context.thisNest.contents.push(context.tokenArgs[0]); // Add attributes to the parent nest step/default
        context.currentNestLevels.push({nestLevel: context.tokenArgs[0], contents: []});
    }
    else { // closer tag
        // Basic nest level and args requirements for closing tags
        if(tagTokenHelper_closeTagGeneric(context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        /* This case seems more annoying than useful - most programmers will likely copy and paste a step template with an attributes section, even for steps with no changes from default.
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
        // Step subsection default requirements
        if(tagTokenHelper_stepSubsections(stepAllSubsections, context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        context.thisNest.contents.push(context.tokenArgs[0]); // Add attributes to the parent nest step/default
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
        // Step subsection default requirements
        if(tagTokenHelper_stepSubsections(stepAllSubsections, context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        context.thisNest.contents.push(context.tokenArgs[0]); // Add attributes to the parent nest step/default
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
        // Step subsection default requirements
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

// Covers the base requirements subsections for steps/defaults, making use of a list of all possible subsections.
// - Checks for potentially missing closing tags from other step subsections
// - Nest level is step or default
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
    
    // Nest Level Requirement: step or default
    if(context.thisNest.nestLevel != "step" && context.thisNest.nestLevel != "default") {
        // Unique message for text due to it also being valid within <hint>
        if(context.tokenArgs[0] == "text") {
            parseResult.warnings.push(newDebugMessage("Invalid positioning for Text subsection tag: <" + context.tokenArgs.join(" ") + ">. Text subsections can only be placed within <step>, <default>, or <hint> subsections. If you are trying to write a comment, use <#></#>. This tag will be ignored.", context, 0));
        }
        else {
            parseResult.warnings.push(newDebugMessage("Invalid positioning for Step subsection tag: <" + context.tokenArgs.join(" ") + ">. Step subsections should only be contained within the <default> section or individual Steps. This tag will be ignored.", context, 0));
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
// --- STEP ATTRIBUTES - 'base/step/attributes/' --- //
///////////////////////////////////////////////////////
// All contents inside the Attributes section, being argument-based tags that modify data about steps.

// Attribute to determine the colour scheme of a step panel.
function tagToken_colourScheme(context: LessonParseTokenContext, parseResult: LessonParseResult) {
    const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token
    const currentStep = (context.rootNest.nestLevel == "step" || (context.thisNest.nestLevel == "step" && context.config.ALLOW_ATTRIBUTES_IN_STEP_NEST))
        ? parseResult.steps[parseResult.steps.length - 1]   // this tag is inside the most recent <step>
        : context.defaultStepTemplate;                      // this tag is inside <default>

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
        const validColourSchemes = 
            ["red", "orange", "green", "blue", "pink", "monochrome"];
        if(!validColourSchemes.includes(context.tokenArgs[1].toLowerCase())) {
            parseResult.warnings.push(newDebugMessage("Unknown Colour Scheme argument: " + token + ". Refer to the documentation for a list of valid arguments. This tag will be ignored and the Step will keep its default Colour Scheme.", context, 0));
            return;
        }
        
        currentStep.colourScheme = context.tokenArgs[1].toLowerCase(); // Updates by reference

        context.thisNest.contents.push(context.tokenArgs[0]); // Add to the parent nest
    }
    else { // closer tag
        // This tag type has no need for a closer tag, and therefore is disregarded
        parseResult.warnings.push(newDebugMessage("Unnecessary closing tag detected: " + token + ". This tag type does not require a closer. The closer tag will be ignored.", context, 0));
    }
}

// Boolean Attribute defining whether the Requirement Message popover should hide the expected value.
function tagToken_hideExpectedValues(context: LessonParseTokenContext, parseResult: LessonParseResult) {
    const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token
    const currentStep = (context.rootNest.nestLevel == "step" || (context.thisNest.nestLevel == "step" && context.config.ALLOW_ATTRIBUTES_IN_STEP_NEST))
        ? parseResult.steps[parseResult.steps.length - 1]   // this tag is inside the most recent <step>
        : context.defaultStepTemplate;                      // this tag is inside <default>

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
                parseResult.suggestions.push(newDebugMessage("Unnecessary boolean attribute tag: " + token + ". This tag is paired to a value that was already false. Boolean argument attributes are false by default.", context, 0));
            }
            currentStep.hideRequirementExpectedValues = false;
        }

        context.thisNest.contents.push(context.tokenArgs[0]); // Add to the parent nest
    }
    else { // closer tag
        // This tag type has no need for a closer tag, and therefore is disregarded (special extra info about boolean attributes)
        parseResult.warnings.push(newDebugMessage("Unnecessary closing tag detected: " + token + ". This tag type does not require a closer. If you are trying to set this value to false, type '<" + context.tokenArgs[0] + " false>'. The closer tag will be ignored.", context, 0));
    }
    // EXTRA MESSAGES IN STEP CLOSER CHECKS:
    // - No hints to make up for hidden guidance
}

// Attribute to determine the panel type of a step (where the panel is displayed in the editor)
function tagToken_panelType(context: LessonParseTokenContext, parseResult: LessonParseResult) {
    const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token
    const currentStep = (context.rootNest.nestLevel == "step" || (context.thisNest.nestLevel == "step" && context.config.ALLOW_ATTRIBUTES_IN_STEP_NEST))
        ? parseResult.steps[parseResult.steps.length - 1]   // this tag is inside the most recent <step>
        : context.defaultStepTemplate;                      // this tag is inside <default>

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
            parseResult.warnings.push(newDebugMessage("Unknown Panel Type argument: " + token + ". Refer to the documentation for a list of valid arguments. This tag will be ignored and the Step will keep its default Panel Type.", context, 0));
            return;
        }
        
        currentStep.panelType = panelArgMap[context.tokenArgs[1].toLowerCase()]; // Updates by reference

        context.thisNest.contents.push(context.tokenArgs[0]); // Add to the parent nest
    }
    else { // closer tag
        // This tag type has no need for a closer tag, and therefore is disregarded
        parseResult.warnings.push(newDebugMessage("Unnecessary closing tag detected: " + token + ". This tag type does not require a closer. The closer tag will be ignored.", context, 0));
    }
    // EXTRA MESSAGES IN STEP CLOSER CHECKS:
    // - Size incompatability with too much text for certain panel types
}

// Covers the base requirements for unique step attributes that take an argument:
// - Inside <attributes> (unless setting allows otherwise).
// - Only one of this attribute specification within the current step.
// Returns 'true' when evaluateTagToken() needs to return early (ignore the tag).
function tagTokenHelper_stepAttributeNestUnique(context: LessonParseTokenContext, parseResult: LessonParseResult) : boolean {
    // Nest Level Requirement: attributes, or just default/step if ALLOW_ATTRIBUTES_IN_STEP_NEST == true.
    if(context.thisNest.nestLevel != "attributes") {
        if(context.config.ALLOW_ATTRIBUTES_IN_STEP_NEST && (context.thisNest.nestLevel == "default" || context.thisNest.nestLevel == "step")) {
            parseResult.suggestions.push(newDebugMessage("Unnested Attribute tag: <" + context.tokenArgs.join(" ") + ">. For better code organisation, consider grouping all Attribute tags within the <attributes> section.", context, 0, "", ""));
        }
        else {
            parseResult.warnings.push(newDebugMessage("Invalid positioning for Attribute tag: <" + context.tokenArgs.join(" ") + ">. Attributes should be stored within a Step's <attributes> section. This tag will be ignored.", context, 0, "", ""));
            return true;
        }
    }

    // Uniqueness Requirement: one per parent section. Also checks the root nest (step/default) in case attributes were validly placed outside of the <attributes> section.
    if(context.thisNest.contents.includes(context.tokenArgs[0]) || context.rootNest.contents.includes(context.tokenArgs[0])) {
        parseResult.warnings.push(newDebugMessage("Multiple instances of Attribute tag within one step: <" + context.tokenArgs[0] + ">. Only the first valid instance of an Attribute tag will be used. This tag will be ignored.", context, 0)); //TBC DOCUMENTATION: ATTRIBUTES
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
// --- STEP HINTS - 'base/step/hints/' --- //
/////////////////////////////////////////////
// Guidance messages that activate based on specified requirements (requirements found in the next section)

// Main enclosing section for a single step, taking a stepRef as an argument and containing all step subsections
function tagToken_hint(context: LessonParseTokenContext, parseResult: LessonParseResult) {
    const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token
    const currentStep = (context.rootNest.nestLevel == "step" || (context.thisNest.nestLevel == "step" && context.config.ALLOW_HINTS_IN_STEP_NEST))
        ? parseResult.steps[parseResult.steps.length - 1]   // this tag is inside the most recent <step>
        : context.defaultStepTemplate;                      // this tag is inside <default>

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
            if((context.thisNest.nestLevel == "step" || context.thisNest.nestLevel == "default") && context.config.ALLOW_HINTS_IN_STEP_NEST) {
                // Hint is valid in this case, but when there's more than one hint in a step, a suggestion to group them is given.
                if(currentStep.hints.length > 0) {
                    parseResult.suggestions.push(newDebugMessage("Consider grouping multiple Hints within one Step into a <hint-list> section for better code organisation.", context, 0));
                }
            }
            else {
                parseResult.warnings.push(newDebugMessage("Invalid positioning for Hint tag: " + token + ". Hints should be nested inside a Step's <hint-list> section. This tag will be ignored.", context, 0));
                return;
            }
        }

        // [u] Maximum amount of hints in one step
        if(currentStep.hints.length >= context.config.MAX_HINTS_PER_STEP) {
            parseResult.ERRORS.push(newDebugMessage("Maximum Hints for one Step reached. Steps are limited to " + context.config.MAX_HINTS_PER_STEP + " total Hints. Consider merging some Hints together or spreading them across multiple Steps. All further <hint> tags in this Step will be ignored.", context, 0)); //TBC DOCUMENTATION: GENERAL LESSON RULES?
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
            parseResult.ERRORS.push(newDebugMessage("Hint is missing valid message content. Ensure either the hint has a non-empty <message> section. This section will be ignored.", context, 0)); //TBC DOCUMENTATION: MESSAGE
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
// --- STEP/HINT REQUIREMENTS - 'base/step/requirements/' --- // TBC: REQUIREMENT LIMITS
////////////////////////////////////////////////////////////////
// Different types of Requirements that must be fulfilled to proceed to the next step (or to show a hint if used in a <hint> section)

// Failed Attempts Requirement for hints. Makes a hint display after a certain amount of failed attempts to go to the next step (from other unfulfilled requirements)
function tagToken_failedAttempts(context: LessonParseTokenContext, parseResult: LessonParseResult) {
    const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token
    const currentStep = (context.rootNest.nestLevel == "step" || (context.thisNest.nestLevel == "step" && context.config.ALLOW_REQUIREMENTS_IN_STEP_NEST))
        ? parseResult.steps[parseResult.steps.length - 1]   // this tag is inside the most recent <step>
        : context.defaultStepTemplate;                      // this tag is inside <default>

    if(context.tokenArgs[0][0] != "/") { // opener tag
        // Nest Level Requirement: ONLY hint. This requirement type is not allowed to be used on steps.
        if(context.thisNest.nestLevel != "hint" && context.thisNest.nestLevel != "requirements_inHint") {
            if(context.thisNest.nestLevel == "requirements" || (context.thisNest.nestLevel == "step" && context.config.ALLOW_REQUIREMENTS_IN_STEP_NEST)) {
                parseResult.warnings.push(newDebugMessage("Invalid positioning for Requirement tag: <" + context.tokenArgs[0] + ">. This Requirement type is not allowed to be used for Steps. It can only be placed inside a <hint> section for conditionally displaying Hints. This tag will be ignored.", context, 0, "", ""));
            }
            else {
                parseResult.warnings.push(newDebugMessage("Invalid positioning for Requirement tag: <" + context.tokenArgs[0] + ">. This Requirement type can only be placed inside a <hint> section for conditionally displaying Hints. This tag will be ignored.", context, 0));
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

        // Create the Requirement (guaranteed to be hint)
        currentStep.hints[currentStep.hints.length - 1].requirements.push({
            reqType: StepRequirementType.FAILED_ATTEMPTS, 
            needed: false,
            numValue: Number(context.tokenArgs[1]),
        });

        context.thisNest.contents.push(context.tokenArgs[0]); // Add to the parent nest step/default
    }
    else { // closer tag
        // This tag type has no need for a closer tag, and therefore is disregarded
        parseResult.warnings.push(newDebugMessage("Unnecessary closing tag detected: " + token + ". This tag type does not require a closer. The closer tag will be ignored.", context, 0));
    }
    // EXTRA MESSAGES IN STEP CLOSER CHECKS:
    // - No step requirements to trigger this
}

// Run Code Requirement, needing the user to click the run code button before progressing
function tagToken_runCode(context: LessonParseTokenContext, parseResult: LessonParseResult) {
    const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token
    const currentStep = (context.rootNest.nestLevel == "step" || (context.thisNest.nestLevel == "step" && context.config.ALLOW_REQUIREMENTS_IN_STEP_NEST))
        ? parseResult.steps[parseResult.steps.length - 1]   // this tag is inside the most recent <step>
        : context.defaultStepTemplate;                      // this tag is inside <default>

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
            currentStep.hints[currentStep.hints.length - 1].requirements.push({
                reqType: StepRequirementType.RUN_CODE, 
                needed: false,
            });
        }
        else { // nest = requirements or step
            currentStep.requirements.push({
                reqType: StepRequirementType.RUN_CODE, 
                needed: false,
                // No textValue or numValue needed for this type
            });
        }

        context.thisNest.contents.push(context.tokenArgs[0]); // Add to the parent nest step/default
    }
    else { // closer tag
        // This tag type has no need for a closer tag, and therefore is disregarded
        parseResult.warnings.push(newDebugMessage("Unnecessary closing tag detected: " + token + ". This tag type does not require a closer. The closer tag will be ignored.", context, 0));
    }
}

// Time Passed Requirement, needing the user to spend a certain amount of seconds on a step
function tagToken_timePassed(context: LessonParseTokenContext, parseResult: LessonParseResult) {
    const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token
    const currentStep = (context.rootNest.nestLevel == "step" || (context.thisNest.nestLevel == "step" && context.config.ALLOW_REQUIREMENTS_IN_STEP_NEST))
        ? parseResult.steps[parseResult.steps.length - 1]   // this tag is inside the most recent <step>
        : context.defaultStepTemplate;                      // this tag is inside <default>

    if(context.tokenArgs[0][0] != "/") { // opener tag
        // Nest Level Requirement: requirements, hint, or step if allowed
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
            currentStep.hints[currentStep.hints.length - 1].requirements.push({
                reqType: StepRequirementType.TIME_PASSED, 
                needed: false,
                numValue: Number(context.tokenArgs[1]),
            });
        }
        else { // nest = requirements or step
            currentStep.requirements.push({
                reqType: StepRequirementType.TIME_PASSED, 
                needed: false,
                numValue: Number(context.tokenArgs[1]),
            });
        }

        context.thisNest.contents.push(context.tokenArgs[0]); // Add to the parent nest step/default
    }
    else { // closer tag
        // This tag type has no need for a closer tag, and therefore is disregarded
        parseResult.warnings.push(newDebugMessage("Unnecessary closing tag detected: " + token + ". This tag type does not require a closer. The closer tag will be ignored.", context, 0));
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
            parseResult.warnings.push(newDebugMessage("Invalid positioning for Requirement tag: <" + context.tokenArgs[0] + ">. Requirements are assigned within a Step's <requirements> section, or inside a <hint> section to assign it to that Hint. This tag will be ignored.", context, 0));
            return true;
        }
    }

    return false;
}