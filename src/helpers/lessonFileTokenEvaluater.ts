// Helper file for lessonFileParser.ts, handling the evaluation of each and every individual tag/text token.

import { LessonParserConfiguration } from "@/helpers/lessonFileParser";
import {LessonStepDetails, StepPanelType, StepRequirementType, LessonParseDebugMessage, LessonParseResult, LessonParseNestSection, LessonRequirement } from "@/types/types";
import { stepHasRequirement } from "./lessonRequirementHandler";
import { strypeFileExtension } from "./common";

// Function for generating suggestions, errors and warnings
function newDebugMessage(type: "suggestion" | "warning" | "error" | "fatal", message: string, context: LessonParseTokenContext, lineNumOffset: number, overrideDoc?: string) : LessonParseDebugMessage {
    return {
        debugMessageContent: message,
        messageType: type,
        lineNum: context.lineNum + lineNumOffset,
        stepRef: context.stepRef,
        documentationKeyword: overrideDoc ?? context.docWord, //optional to modify, allows some messages to point the user to a more accurate place
    };
}

// Special function for initial file errors
function fileFatalErrorMessage(message: string, doc: string) : LessonParseDebugMessage {
    return {
        debugMessageContent: message,
        messageType: "fatal",
        lineNum: -1,
        stepRef: "",
        documentationKeyword: doc,
    };
}

// All attributes that take a specific set of valid parameters have their lists kept consistent here
export function fetchValidParameters(token: string): string[] {
    switch(token) {
    case("colour-scheme"):
        // IMPORTANT: LessonPanel.vue has a list of colour schemes to match to css schemes.
        // When a new value is put here, it will also need to be added there.
        return ["red", "orange", "green", "blue", "pink", "monochrome"];

    case("difficulty"):
        // IMPORTANT: lessonMetadataPoints.ts has its own map for displaying the data point.
        // When a new value is put here, it will also need to be added there.
        return ["easy", "beginner", "medium", "intermediate", "hard", 
            "advanced", "extreme", "1-star", "2-star", "3-star", 
            "4-star", "5-star"];

    case("initial-python-file"):
        return [strypeFileExtension, "py"];

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
    docWord: string;

    // Initial settings and data used for the parser
    config: LessonParserConfiguration;
}

// ----- INITIAL FILE RESTRICTIONS -----

// Examines the file size and returns true if it should not be parsed
export function evaluateInitialLessonFile(sourceLines: string[], parseResult: LessonParseResult, parserConfig: LessonParserConfiguration): boolean {
    if(sourceLines.join().length + parseResult.details.title.length > parserConfig.MAX_FILE_SIZE_BYTES) {
        parseResult.debugMessages.push(fileFatalErrorMessage("FATAL - File exceeds maximum size. Lesson Files can only be " + Math.floor(parserConfig.MAX_FILE_SIZE_BYTES / 1024) + "KB at most (estimated " + Math.floor((sourceLines.join().length + parseResult.details.title.length) / 1024) + ").", ""));
        parseResult.success = false;
        return true;
    }

    if(sourceLines.length > 999) {
        parseResult.debugMessages.push(fileFatalErrorMessage("FATAL - File exceeds maximum line count. Lesson Files can only be " + parserConfig.MAX_FILE_LINES + " lines at most (found " + sourceLines.length + "). Consider reducing the amount of lines used.", ""));
        parseResult.success = false;
        return true;
    }

    // If here is reached, all checks are ok and parsing can proceed
    return false;
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
        stepRef: (nestLevels.length > 1 && nestLevels[1].nestLevel == "step") && parseResult.steps.length > 0 ? parseResult.steps[parseResult.steps.length - 1].stepRef : "", //Obtain stepRef from parseResult
        docWord: nestLevels[nestLevels.length - 1].nestLevel, // Used to store a lookup for a tag's specific documentation info, used in debug messages
        currentNestLevels: nestLevels,
        thisNest: nestLevels[nestLevels.length - 1],
        defaultsStepTemplate: initialDefaultStep, // Modified by <defaults>, cloned by <step>
    };

    const currentStep = parseResult.steps.length > 0 ? parseResult.steps[parseResult.steps.length - 1] : initialDefaultStep;

    if(context.config.DEBUG_LOG_TOKENS) {
        console.log("Detected text token: " + token + " at nest level " + context.thisNest.nestLevel);
    }

    // -- INSTANT ERROR CASES --
    if(token[0] == "<") {
        // Assuming previous case didn't hit, this is most likely caused by an incomplete tag typo, such as "</step".
        parseResult.debugMessages.push(newDebugMessage("fatal", "FATAL - Likely mistyped tag: " + token.split(" ")[0] + ".", context, 1));
        parseResult.success = false;
        return;
    }

    if(token[token.length - 1] == ">") {
        // Same as above but other way around, such as "text>".
        parseResult.debugMessages.push(newDebugMessage("fatal", "FATAL - Likely mistyped tag: " + token.split(" ").at(-1) + ".", context, 1));
        parseResult.success = false;
        return;
    }
    
    if(context.currentNestLevels.length == 1) {
        // Text token is on root, meaning it is not in any sections
        parseResult.debugMessages.push(newDebugMessage("fatal", "FATAL - Unsectioned text segment: '" + (token.length > 32 ? (token.slice(0, 32) + "...") : token) + "' To add comments safely, please use the comment tags <#> </#>.", context, 0, "#"));
        parseResult.success = false;
        return;
    }

    if(context.thisNest.nestLevel == "step") {
        // Specific message for text nested in a step, likely due to the programmer forgetting a <text> tag.
        parseResult.debugMessages.push(newDebugMessage("fatal", "FATAL - Invalid location for text segment: '" + (token.length > 32 ? (token.slice(0, 32) + "...") : token) + "', detected in <step> section. To specify the text content of a Step, it must be wrapped in a <text> section. If you are trying to add a comment instead, please use the comment tags <#> </#>.", context, 0, "text"));
        parseResult.success = false;
        return;
    }

    // Valid text tokens are stored between a single opening and closing tag. This means that the behaviour of this function can be sorted by the current nest level.
    // Similar to evaluateTagToken(), they are implemented in alphabetical order.
    // Same briefing about requirements and debug messages from evaluateTagToken() applies here too.

    // -- TEXT TOKEN HANDLING --

    // nest level "#" (comments) is handled in Silent Return cases above. No further logic is needed for the text token as it is simply a comment.

    if(context.thisNest.nestLevel == "description") { 
        // [u] Title isn't too long
        if(token.length > context.config.MAX_LENGTH_DESCRIPTION) {
            parseResult.debugMessages.push(newDebugMessage("warning", "Lesson Description shortened due to exceeding the character limit of " + context.config.MAX_LENGTH_DESCRIPTION + ".", context, 0));
        }

        parseResult.details.description = token.slice(0, context.config.MAX_LENGTH_DESCRIPTION);
        context.thisNest.contents.push("valid_token"); // Indicator that there is a valid text token within this nest
        return;
    }
    
    // Same logic regardless of negation status
    if(context.thisNest.nestLevel == "has-python" || context.thisNest.nestLevel == "!has-python" ) { 
        // [u] Content isn't too long
        if(token.length > context.config.MAX_LENGTH_HAS_PYTHON) {
            // This is enforced even when ALLOW_REQUIREMENTS_ABOVE_MAX_VALUES is set to true for memory usage considerations
            parseResult.debugMessages.push(newDebugMessage("warning", "<" + context.thisNest.nestLevel + "> Requirement Text '" + token.slice(0, 32) + "...' shortened due to exceeding the character limit of " + context.config.MAX_LENGTH_HAS_PYTHON + ". If you need to match more Python content, make use of multiple seperate Requirements, as this Requirement type can be repeated.", context, 0));
        }

        // Update the requirement
        currentStep.requirements[currentStep.requirements.length - 1].textValue = token.slice(0, context.config.MAX_LENGTH_HAS_PYTHON);
        context.thisNest.contents.push("valid_token"); // Indicator that there is a valid text token within this nest
        return;
    }
    
    // Same logic regardless of negation status
    if(context.thisNest.nestLevel == "has-python_inHint" || context.thisNest.nestLevel == "!has-python_inHint" ) { // HINT VARIANT
        // [u] Content isn't too long
        if(token.length > context.config.MAX_LENGTH_HAS_PYTHON) {
            // This is enforced even when ALLOW_REQUIREMENTS_ABOVE_MAX_VALUES is set to true for memory usage considerations
            parseResult.debugMessages.push(newDebugMessage("warning", "<" + context.thisNest.nestLevel + "> Requirement Text '" + token.slice(0, 32) + "...' shortened due to exceeding the character limit of " + context.config.MAX_LENGTH_HAS_PYTHON + ". If you need to match more Python content, make use of multiple seperate Requirements, as this Requirement type can be repeated.", context, 0));
        }

        // Update the requirement
        const currentHint = currentStep.hints[currentStep.hints.length - 1];
        currentHint.requirements[currentHint.requirements.length - 1].textValue = token.slice(0, context.config.MAX_LENGTH_HAS_PYTHON);
        context.thisNest.contents.push("valid_token"); // Indicator that there is a valid text token within this nest
        return;
    }

    if(context.thisNest.nestLevel == "initial-python-file") { 
        // Realistically, checks for a valid Python file cannot be made here, so instead errors will need to be given upon trying to upload it to the IDE

        // [u] Content isn't too long
        if(token.length > context.config.MAX_INITIAL_PYTHON_SIZE_BYTES) {
            // This is enforced even when ALLOW_REQUIREMENTS_ABOVE_MAX_VALUES is set to true for memory usage considerations
            parseResult.debugMessages.push(newDebugMessage("fatal", "Initial Python File exceeds the size limit of " + Math.floor(parserConfig.MAX_INITIAL_PYTHON_SIZE_BYTES / 1024) + "KB. Please refrain from manually modifying the <initial-python-file> content. To add an Initial Python File to this Lesson, upload it in the editor.", context, 0));
            parseResult.success = false;
            return;
        }

        // No further logic beyond here - the python content is read directly from sourceLines[] when stored.
        context.thisNest.contents.push("valid_token"); // Indicator that there is a valid text token within this nest
        return;
    }
    
    if(context.thisNest.nestLevel == "text") { 
        if(context.currentNestLevels[1].nestLevel != "step") {
            // If the parent nest level is invalid, no error message is needed due to that already being displayed by the tag token evaluator
            return;
        }

        // [u] Text isn't too long
        if(token.length > context.config.MAX_LENGTH_STEP_TEXT) {
            parseResult.debugMessages.push(newDebugMessage("warning", "Step Text '" + token.slice(0, 32) + "...' shortened due to exceeding the character limit of " + context.config.MAX_LENGTH_STEP_TEXT + ".", context, 0));
        }
        else if(token.length > 275) { // Roughly the amount of chars before a scrollbar appears
            parseResult.debugMessages.push(newDebugMessage("suggestion", "Step Text '" + token.slice(0, 32) + "...' is considerably long for a single Step and will likely have a scroll bar.", context, 0));
        }

        // Update the step
        currentStep.textContent = token.slice(0, context.config.MAX_LENGTH_STEP_TEXT);
        context.thisNest.contents.push("valid_token"); // Indicator that there is a valid text token within this nest
        return;
    }
    
    if(context.thisNest.nestLevel == "text_inHint") { // HINT VARIANT
        // [u] Text isn't too long
        if(token.length > context.config.MAX_LENGTH_DESCRIPTION) {
            parseResult.debugMessages.push(newDebugMessage("warning", "Hint Text '" + token.slice(0, 32) + "...' shortened due to exceeding the character limit of " + context.config.MAX_LENGTH_HINT_TEXT + ".", context, 0));
        }

        // Update the hint
        currentStep.hints[currentStep.hints.length - 1].message = token.slice(0, context.config.MAX_LENGTH_HINT_TEXT);
        context.thisNest.contents.push("valid_token"); // Indicator that there is a valid text token within this nest
        return;
    }
    
    if(context.thisNest.nestLevel == "title") { 
        // [u] Title isn't too long
        if(token.length > context.config.MAX_LENGTH_TITLE) {
            parseResult.debugMessages.push(newDebugMessage("warning", "Lesson Title shortened due to exceeding the character limit of " + context.config.MAX_LENGTH_TITLE + ".", context, 0));
        }

        parseResult.details.title = token.slice(0, context.config.MAX_LENGTH_TITLE);
        context.thisNest.contents.push("valid_token"); // Indicator that there is a valid text token within this nest
        return;
    }
    
    // If this point is reached, then the text is not stored within a valid nest. Due to the possibility of it containing another tag, this needs to be a FATAL error.
    // (if this message is shown for a valid nest, then that nest's if-condition is missing a return; at the end of its blcok)
    parseResult.debugMessages.push(newDebugMessage("fatal", "FATAL - Invalid location for text segment: '" + (token.length > 32 ? (token.slice(0, 32) + "...") : token) + "' Uncommented text segments cannot be included in the <" + context.thisNest.nestLevel.split("_")[0] + "> section. To add comments safely, please use the comment tags <#> </#>.", context, 0, "#"));
    parseResult.success = false;
    return;    
}

// ----- TAG TOKENS -----

// Main token reader for tags, making changes to nestLevel and parseResult as required. This is the main handler for the language's syntax.
// Individual tag tokens have their own unique function for logic and debugging, named as tagToken_{token}().
// Other functions named tagTokenHelper_{usage}() are used to reduce repeated code and keep consistency in certain debug messages.
export function evaluateTagToken(token: string, nestLevels: LessonParseNestSection[], currentLineNum: number, parseResult: LessonParseResult, initialDefaultStep: LessonStepDetails, parserConfig: LessonParserConfiguration) : void {
    // -- SPECIAL FAILSAFE -- 
    if(nestLevels.length == 0) { // "root" has somehow been popped
        // This should never be encountered by a user, but this will break a LOT of stuff if it happens to occur, so this is mainly for debugging.
        nestLevels.push({nestLevel: "root", contents: []});
        console.error("Lesson Error: 'root' was somehow popped. There is a major fault with the parser.");
    }
    
    // -- INIT --
    const context: LessonParseTokenContext = {
        // These elements shouldn't be edited beyond here, instead only being read
        tokenArgs: token.slice(1, -1).split(" "), // Removes the < and >, and then splits by space
        lineNum: currentLineNum,
        config: parserConfig,

        // These elements could be edited
        stepRef: (nestLevels.length > 1 && nestLevels[1].nestLevel == "step") && parseResult.steps.length > 0 ? parseResult.steps[parseResult.steps.length - 1].stepRef : "", //Obtain stepRef from parseResult
        docWord: token.slice(1, -1).split(" ")[0], // Used to store a lookup for a tag's specific documentation info, used in debug messages
        currentNestLevels: nestLevels,
        thisNest: nestLevels[nestLevels.length - 1],
        defaultsStepTemplate: initialDefaultStep, // Modified by <defaults>, cloned by <step>
    };

    context.tokenArgs[0] = context.tokenArgs[0].toLowerCase(); // Tag keywords are entirely evaluated in lowercase

    // Lists of all potentially missing closing tags in the step nest level, mainly used for detecting commonly missing closing tags and working around them them
    const stepAllSubsections = ["text", "attributes", "requirements", "hints", "hint-list"];

    // -- INSTANT ERROR CASES --

    if(token == "<>" || token.replace(/\s/g, "") == "<>") { // .replace(/\s/g, "") <- whitespace remover
        parseResult.debugMessages.push(newDebugMessage("warning", "Ignoring empty tag: " + token + ".", context, 0, ""));
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
    // The programmer will not be able to run the lesson if there are any errors. They can run it with warnings, but this is advised to be avoided.

    // -- TAG HANDLING --

    if(context.config.DEBUG_LOG_TOKENS) {
        console.log("Detected tag token: " + token + " at nest level " + context.thisNest.nestLevel);
    }

    const tagTokenMethods: Record<string, (context: any, parseResult: any) => void> = {

        "#": (ctx, pr) => tagToken_commentHashtag(ctx, pr),

        "attributes": (ctx, pr) => tagToken_attributes(stepAllSubsections, ctx, pr),

        "changes-made": (ctx, pr) => tagToken_changesMade(ctx, pr),
        "!changes-made": (ctx, pr) => tagToken_changesMade(ctx, pr), // Requirement negation

        "colour-scheme": (ctx, pr) => tagToken_colourScheme(ctx, pr),
        "color-scheme": (ctx, pr) => tagToken_colourScheme(ctx, pr), // Alternative spelling

        "defaults": (ctx, pr) => tagToken_defaults(ctx, pr),

        "description": (ctx, pr) => tagToken_description(ctx, pr),

        "difficulty": (ctx, pr) => tagToken_difficulty(ctx, pr),

        "estimated-time": (ctx, pr) => tagToken_estimatedTime(ctx, pr),

        "failed-attempts": (ctx, pr) => tagToken_failedAttempts(ctx, pr),
        "!failed-attempts": (ctx, pr) => tagToken_failedAttempts(ctx, pr), // Requirement negation

        "has-python": (ctx, pr) => tagToken_hasPython(ctx, pr),
        "!has-python": (ctx, pr) => tagToken_hasPython(ctx, pr), // Requirement negation

        "hide-expected-values": (ctx, pr) => tagToken_hideExpectedValues(ctx, pr),

        "hint": (ctx, pr) => tagToken_hint(ctx, pr),

        "hint-list": (ctx, pr) => tagToken_hintList(stepAllSubsections, ctx, pr),

        "initial-python-file": (ctx, pr) => tagToken_initialPythonFile(ctx, pr),

        "metadata": (ctx, pr) => tagToken_metadata(ctx, pr),

        "min-requirements": (ctx, pr) => tagToken_minRequirements(ctx, pr),

        "no-errors": (ctx, pr) => tagToken_noErrors(ctx, pr),
        "!no-errors": (ctx, pr) => tagToken_noErrors(ctx, pr), // Requirement negation

        "panel-type": (ctx, pr) => tagToken_panelType(ctx, pr),

        "requirements": (ctx, pr) => {
            if(ctx.thisNest.nestLevel == "hint" || ctx.thisNest.nestLevel == "requirements_inHint") {
                tagToken_requirements_inHint(ctx, pr); // Hint variant
            }
            else {
                tagToken_requirements(stepAllSubsections, ctx, pr);
            }
        },

        "run-code": (ctx, pr) => tagToken_runCode(ctx, pr),
        "!run-code": (ctx, pr) => tagToken_runCode(ctx, pr), // Requirement negation

        "step": (ctx, pr) => tagToken_step(stepAllSubsections, ctx, pr),

        "text": (ctx, pr) => {
            if(ctx.thisNest.nestLevel == "hint" || ctx.thisNest.nestLevel == "text_inHint") {
                tagToken_text_inHint(ctx, pr); // Hint variant
            }
            else {
                tagToken_text(stepAllSubsections, ctx, pr);
            }
        },

        "time-passed": (ctx, pr) => tagToken_timePassed(ctx, pr),
        "!time-passed": (ctx, pr) => tagToken_timePassed(ctx, pr), // Requirement negation

        "title": (ctx, pr) => tagToken_title(ctx, pr),
    };

    // Conditional allows both <tag> and </tag> point to the same method (no need for duplicate lines)
    // Does NOT pick up <!tag> for Requirement negation, since this would require every handler function to have a detection case for invalid '!' use
    const tokenMethod = tagTokenMethods[context.tokenArgs[0][0] == "/" ? context.tokenArgs[0].slice(1) : context.tokenArgs[0]];
    if(tokenMethod) {
        tokenMethod(context, parseResult); // Calls the main handler function based on Record above
        return;
    }

    // If this point is reached, then the tag has not been matched to any valid input. 
    // (if this message is shown for a valid tag, then that tag's if-condition is missing a return; at the end of its block)
    if(token[1] == "!") {
        parseResult.debugMessages.push(newDebugMessage("suggestion", "Negation symbol '!' used on a non-Requirement Tag. Did you mean '/'?", context, 0, "")); // TBC DOCUMENTATION: NEGATION SYMBOL
    }
    parseResult.debugMessages.push(newDebugMessage("warning", "Unknown tag: " + token + ". Check for typos and refer to the documentation for all of valid tags. This tag will be ignored.", context, 0, ""));
}

// ALL TAG TOKEN FUNCTIONS DEFINED BELOW.
// Tag Token Functions 'tagToken_' are defined in groups based on usage, structured similarly to the Documentation.
// Also has Helper functions, denoted as 'tagTokenHelper_'. Used to reduce the amount of repeated code.

/* TEMPLATE FOR NEW TAG TOKEN EVAL FUNCTION

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
function tagTokenHelper_similarTagSuggestion(nestCheck: string[], potentialToken: string, context: LessonParseTokenContext, parseResult: LessonParseResult) {
    if(nestCheck.includes(context.thisNest.nestLevel)) {
        parseResult.debugMessages.push(newDebugMessage("suggestion", "<" + context.tokenArgs[0] + "> tag detected within <" + context.thisNest.nestLevel.split("_")[0] + "> section. Did you mean <" + potentialToken + ">?", context, 0, potentialToken));
    }
}

// Baseline 'no args' requirement.
// No return needed as arguments are simply ignored
function tagTokenHelper_noArgsGeneric(context: LessonParseTokenContext, parseResult: LessonParseResult, overrideMessage?: string) {
    if(context.tokenArgs.length > 1) {
        parseResult.debugMessages.push(newDebugMessage("warning", overrideMessage ?? "Unnecessary arguments found within tag: <" + context.tokenArgs.join(" ") + ">. Excess arguments will be ignored.", context, 0));
    }
}

// Covers all tags expecting a fixed amount of arguments.
// Do not use this method for flexible argument counts.
function tagTokenHelper_fixedArgsGeneric(expectedArgs: number, context: LessonParseTokenContext, parseResult: LessonParseResult) : boolean {
    // Arguments Requirment: dependant on expectedArgs, usually being 0 or 1.
    if(context.tokenArgs.length - 1 > expectedArgs) {
        parseResult.debugMessages.push(newDebugMessage("warning", "Unnecessary arguments found within tag: <" + context.tokenArgs.join(" ") + ">. Expected " + expectedArgs + ", Found " + (context.tokenArgs.length - 1) + ". Excess arguments will be ignored.", context, 0));
    }
    if(context.tokenArgs.length - 1 < expectedArgs) {
        parseResult.debugMessages.push(newDebugMessage("warning", "Missing arguments for tag: <" + context.tokenArgs.join(" ") + ">.  Expected " + expectedArgs + ", Found " + (context.tokenArgs.length - 1) + ". This tag will be ignored.", context, 0));
        return true;
    }

    return false;
}

// Default warning message for when there is no closer tag needed for this type of token
function tagTokenHelper_noCloserTagNeeded(context: LessonParseTokenContext, parseResult: LessonParseResult) {
    parseResult.debugMessages.push(newDebugMessage("warning", "Unnecessary closing tag detected: <" + context.tokenArgs.join(" ") + ">. This tag type does not require a closer. The closer tag will be ignored.", context, 0));
}

// Covers the two main defaults requirements for (almost?) all closing tags:
// - No arguments
// - Valid opening tag (checked by nest level)
// Returns 'true' when evaluateTagToken() needs to return early (ignore the tag).
function tagTokenHelper_closeTagGeneric(context: LessonParseTokenContext, parseResult: LessonParseResult, variantSuffix?: string) : boolean {
    // Variant suffix is used to modify the required nest level for Variant tags (for example text_inHint)

    // Nest Level Requirement: same as the token name without the / (e.g. /text requires text)
    if(context.thisNest.nestLevel != context.tokenArgs[0].slice(1) + (variantSuffix ?? "")) { //slice(1) removes the /
        parseResult.debugMessages.push(newDebugMessage("warning", "Invalid positioning for closing tag: <" + context.tokenArgs.join(" ") + ">, found in '" + context.thisNest.nestLevel.split("_")[0] + "' section. No valid paired opening tag is detected. This tag will be ignored.", context, 0));
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
            parseResult.debugMessages.push(newDebugMessage("error", "Likely mistyped closer tag: <" + context.tokenArgs.join(" ") + ">. Closer tags must contain the closing symbol '/'. The parser will attempt to continue beyond this.", context, 0)); //TBC DOCUMENTATION: SECTIONS
        
            // Attempts to resolve the issue by removing the step nestLevel and continuing. Only continues to scan for more errors for convenience.
            context.currentNestLevels.pop();
            context.thisNest = context.currentNestLevels[context.currentNestLevels.length - 1];
        }
        else {
            parseResult.debugMessages.push(newDebugMessage("fatal", "FATAL - Likely mistyped closer tag: <" + context.tokenArgs.join(" ") + ">. Closer tags must contain the closing symbol '/'.", context, 0)); //TBC DOCUMENTATION: SECTIONS
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
            parseResult.debugMessages.push(newDebugMessage("error", "Likely missing closing tag </" + context.thisNest.nestLevel.split("_")[0] + ">. All section-based tags must have a closer. The parser will attempt to continue beyond this.", context, 0)); //TBC DOCUMENTATION: SECTIONS
            
            // Attempts to resolve the issue by removing the step nestLevel and continuing. Only continues to scan for more errors for convenience.
            context.currentNestLevels.pop();
            context.thisNest = context.currentNestLevels[context.currentNestLevels.length - 1];
        }
        else {
            parseResult.debugMessages.push(newDebugMessage("fatal", "FATAL - Likely missing closing tag </" + context.thisNest.nestLevel.split("_")[0] + ">. All section-based tags must have a closer.", context, 0)); //TBC DOCUMENTATION: SECTIONS
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
            parseResult.debugMessages.push(newDebugMessage("warning", "Invalid positioning for Metadata tag: " + token + ", found in '" + context.thisNest.nestLevel.split("_")[0] + "' section. The Metadata section should not be nested in other sections. This tag will be ignored.", context, 0));
            return;
        }

        // Arguments Requirment: no args
        tagTokenHelper_noArgsGeneric(context, parseResult);

        // Uniqueness Requirement: one per file (potentially recommended but not enforced)
        if(context.thisNest.contents.includes("metadata")) {
            if(context.config.ALLOW_MULTIPLE_METADATA_SECTIONS) {
                parseResult.debugMessages.push(newDebugMessage("suggestion", "Multiple <metadata> sections detected. It is recommended to have a single Metadata section kept at the top of the Lesson File.", context, 0));
            }
            else {
                parseResult.debugMessages.push(newDebugMessage("fatal", "FATAL - Multiple <metadata> sections detected. Ensure that you have a single Metadata section kept at the top of the Lesson File.", context, 0));
                parseResult.success = false;
                return;
            }
        }

        // [u] Positioning within the file, checked via the contents of root. Recommended to be at the top of the file before any steps or defaults.
        if(context.thisNest.contents.length > 0 && context.thisNest.contents[0] != "metadata") {
            parseResult.debugMessages.push(newDebugMessage("suggestion", "Consider moving the <metadata> section to the top of the Lesson File for better organisation.", context, 0));
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
            parseResult.debugMessages.push(newDebugMessage("warning", "Empty Metadata section detected. Refer to the documentation for a list of valid tags to be used within this section. This section will be ignored.", context, 0));
            
            // Remove this Metadata record from root contents (will be most recent entry assuming valid opening tag)
            // Prevents a niche error case where user has an empty <metadata> section, and then a valid one right after. Ignoring this section will allow the parser to read the next one as valid.
            context.currentNestLevels[0].contents.pop();
        }

        context.currentNestLevels.pop(); // Remove nestLevel
    }
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
            parseResult.debugMessages.push(newDebugMessage("suggestion", "Consider placing " + token + " subsection within the Lesson's <metadata> section for better organisation.", context, 0));
        } 
        else if(context.thisNest.nestLevel != "metadata") {
            // Potential mistake between distinguishing <title> and <text>
            tagTokenHelper_similarTagSuggestion(["step", "hint"], "text", context, parseResult);

            parseResult.debugMessages.push(newDebugMessage("warning", "Invalid positioning for Description tag: " + token + ", found in '" + context.thisNest.nestLevel.split("_")[0] + "' section. The Lesson's Description should be specified within the <metadata> section. This tag will be ignored.", context, 0));
            return;
        }

        // Arguments Requirment: no args with special informative message
        tagTokenHelper_noArgsGeneric(context, parseResult, "Unnecessary arguments found within tag: <" + context.tokenArgs.join(" ") + ">. The Lesson Description is specified as a text section, not within tag arguments. These arguments will be ignored.");
    
        // [u] Check for whether value has already been modified (can't use normal nest.contents method due to potentially multiple metadata sections + non-nested tokens)
        if(parseResult.details.description != context.config.PLACEHOLDER_TEXT) {
            parseResult.debugMessages.push(newDebugMessage("fatal", "FATAL - Multiple Description sections detected. Please ensure the Lesson File only contains one <description> tag.", context, 0));
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
            parseResult.debugMessages.push(newDebugMessage("warning", "Empty " + token + " section detected. Ensure that text-based sections contain at least one non-whitespace character. This section has been ignored.", context, 0)); //TBC DOCUMENTATION: SECTIONS
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
            parseResult.debugMessages.push(newDebugMessage("suggestion", "Consider placing " + token + " subsection within the Lesson's <metadata> section for better organisation.", context, 0));
        } 
        else if(context.thisNest.nestLevel != "metadata") {
            parseResult.debugMessages.push(newDebugMessage("warning", "Invalid positioning for Difficulty tag: " + token + ", found in '" + context.thisNest.nestLevel.split("_")[0] + "' section. The Lesson's Difficulty should be specified within the <metadata> section. This tag will be ignored.", context, 0));
            return;
        }

        // Argument Requirement: 1
        if(tagTokenHelper_fixedArgsGeneric(1, context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // [u] Unknown argument which does not match any valid inputs
        if(!fetchValidParameters("difficulty").includes(context.tokenArgs[1].toLowerCase())) {
            parseResult.debugMessages.push(newDebugMessage("warning", "Unknown Difficulty argument: " + token + ". Refer to the documentation for a list of valid arguments. This tag will be ignored.", context, 0));
            return;
        }
    
        // [u] Check for whether value has already been modified (can't use normal nest.contents method due to potentially multiple metadata sections + non-nested tokens)
        if(parseResult.details.difficulty) {
            parseResult.debugMessages.push(newDebugMessage("warning", "Multiple Difficulty tags detected. Lessons can only be assigned a single Difficulty value. This tag will be ignored.", context, 0));
            return;
        }

        parseResult.details.difficulty = context.tokenArgs[1].toLowerCase(); // Assign the value
        context.thisNest.contents.push(context.tokenArgs[0]); // Add to the parent nest
    }
    else { // closer tag
        // This tag type has no need for a closer tag, and therefore is disregarded
        tagTokenHelper_noCloserTagNeeded(context, parseResult);
    }
}

// Estimated time display shown in the list of lessons
function tagToken_estimatedTime(context: LessonParseTokenContext, parseResult: LessonParseResult) {
    const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token

    if(context.tokenArgs[0][0] != "/") { // opener tag
        // Nest Level Requirement: metadata (or root if allowed by ALLOW_METADATA_IN_ROOT)
        if(context.thisNest.nestLevel == "root" && context.config.ALLOW_METADATA_IN_ROOT) {
            parseResult.debugMessages.push(newDebugMessage("suggestion", "Consider placing " + token + " subsection within the Lesson's <metadata> section for better organisation.", context, 0));
        } 
        else if(context.thisNest.nestLevel != "metadata") {
            tagTokenHelper_similarTagSuggestion(["step", "requirements", "hint", "requirements_inHint"], "time-passed", context, parseResult);

            parseResult.debugMessages.push(newDebugMessage("warning", "Invalid positioning for Estimated Time tag: " + token + ", found in '" + context.thisNest.nestLevel.split("_")[0] + "' section. The Lesson's Estimated Time should be specified within the <metadata> section. This tag will be ignored.", context, 0));
            return;
        }

        // Argument Requirement: 1
        if(tagTokenHelper_fixedArgsGeneric(1, context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // [u] Argument restrictions: must be a positive integer, shouldn't be insanely high
        if(context.tokenArgs[1] == "0" || !(/^\d+$/.test(context.tokenArgs[1]))) { // '^\d+$' is a Positive Integer Regex, allowing strings that only contain digits 0-9 (no . or -)
            parseResult.debugMessages.push(newDebugMessage("warning", "Invalid argument: " + token + ". This tag only accepts integers greater than 0 as an argument, measured in minutes. This tag will be ignored.", context, 0));
            return;
        }
        if(Number(context.tokenArgs[1]) > 999) {
            parseResult.debugMessages.push(newDebugMessage("warning", "Invalid argument: " + token + ". The maximum value for this argument is 999 minutes. This tag will be ignored.", context, 0));
            return;
        }
    
        // [u] Check for whether value has already been modified (can't use normal nest.contents method due to potentially multiple metadata sections + non-nested tokens)
        if(parseResult.details.estimatedTime) {
            parseResult.debugMessages.push(newDebugMessage("warning", "Multiple Estimated Time tags detected. Lessons can only be assigned a single Difficulty value. This tag will be ignored.", context, 0));
            return;
        }

        parseResult.details.estimatedTime = Number(context.tokenArgs[1]); // Assign the value
        context.thisNest.contents.push(context.tokenArgs[0]); // Add to the parent nest
    }
    else { // closer tag
        // This tag type has no need for a closer tag, and therefore is disregarded
        tagTokenHelper_noCloserTagNeeded(context, parseResult);
    }
}

// Title of the Lesson File (not the project name).
function tagToken_title(context: LessonParseTokenContext, parseResult: LessonParseResult) {
    const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token

    if(context.tokenArgs[0][0] != "/") { // opener tag
        // Nest Level Requirement: metadata (or root if allowed by ALLOW_METADATA_IN_ROOT)
        if(context.thisNest.nestLevel == "root" && context.config.ALLOW_METADATA_IN_ROOT) {
            parseResult.debugMessages.push(newDebugMessage("suggestion", "Consider placing " + token + " subsection within the Lesson's <metadata> section for better organisation.", context, 0));
        } 
        else if(context.thisNest.nestLevel != "metadata") {
            // Potential mistake between distinguishing <title> and <text>
            tagTokenHelper_similarTagSuggestion(["step", "hint"], "text", context, parseResult);

            parseResult.debugMessages.push(newDebugMessage("warning", "Invalid positioning for Title tag: " + token + ", found in '" + context.thisNest.nestLevel.split("_")[0] + "' section. The Lesson's Title should be specified within the <metadata> section. This tag will be ignored.", context, 0));
            return;
        }

        // Arguments Requirment: no args with special informative message
        tagTokenHelper_noArgsGeneric(context, parseResult, "Unnecessary arguments found within tag: <" + context.tokenArgs.join(" ") + ">. The Lesson Title is specified as a text section, not within tag arguments. These arguments will be ignored.");
    
        // [u] Check for whether value has already been modified (can't use normal nest.contents method due to potentially multiple metadata sections + non-nested tokens)
        if(parseResult.details.title != context.config.PLACEHOLDER_TEXT) {
            parseResult.debugMessages.push(newDebugMessage("fatal", "FATAL - Multiple Title sections detected. Please ensure the Lesson File only contains one <title> tag.", context, 0));
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
            parseResult.debugMessages.push(newDebugMessage("warning", "Empty " + token + " section detected. Ensure that text-based sections contain at least one non-whitespace character. This section has been ignored.", context, 0)); //TBC DOCUMENTATION: SECTIONS
            context.currentNestLevels[context.currentNestLevels.length - 2].contents.pop(); // Deletes the respective element from contents of parent node, 'ignoring' the section.
        }

        context.currentNestLevels.pop(); // Remove nestLevel
    }
}

//////////////////////////////////////////
// --- INITIAL DEFINITION - 'root/' --- //
//////////////////////////////////////////
// Definition for Initial File section

// Takes a parameter for the file type and specifies a text section
function tagToken_initialPythonFile(context: LessonParseTokenContext, parseResult: LessonParseResult) {
    // IMPORTANT NOTE: This section will not normally be editable, being handled by an upload system instead and hidden from the editor.
    // Whilst this does reduce the risk of error, there is potential for it to be modified in the downloaded Lesson File, so checks must still be made.

    if(context.tokenArgs[0][0] != "/") { // opener tag
        // [u] Nest level is either metadata, defaults or step - likely forgotten closing tag
        if(["step", "defaults", "metadata"].includes(context.thisNest.nestLevel)) {
            if(context.config.CONTINUE_FROM_MISSING_CLOSER) {
                parseResult.debugMessages.push(newDebugMessage("error", "Likely missing closing tag </" + context.thisNest.nestLevel.split("_")[0] + ">. All section-based tags must have a closer. The parser will attempt to continue beyond this.", context, -1)); //TBC DOCUMENTATION: SECTIONS
                
                // Attempts to resolve the issue by removing the step nestLevel and continuing. Only continues to scan for more errors for convenience.
                context.currentNestLevels.pop();
                context.thisNest = context.currentNestLevels[context.currentNestLevels.length - 1];
            }
            else {
                parseResult.debugMessages.push(newDebugMessage("fatal", "FATAL - Likely missing closing tag </" + context.thisNest.nestLevel.split("_")[0] + ">. All section-based tags must have a closer.", context, -1)); //TBC DOCUMENTATION: SECTIONS
                parseResult.success = false;
                return;
            }
        }

        // Nest Level Requirement: root (no nesting)
        if(context.thisNest.nestLevel != "root") {
            parseResult.debugMessages.push(newDebugMessage("warning", "The Initial File should not be specified manually. To add an Initial Python File to this Lesson, upload it in the editor. This tag will be ignored.", context, 0));
            return;
        }

        // Argument Requirement: 1
        if(tagTokenHelper_fixedArgsGeneric(1, context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // [u] Unknown argument which does not match any valid inputs
        if(!fetchValidParameters("initial-python-file").includes(context.tokenArgs[1].toLowerCase())) {
            parseResult.debugMessages.push(newDebugMessage("error", "Unknown File Type for Initial File. Please refrain from manually modifying the <initial-python-file> Tag. To add an Initial Python File to this Lesson, upload it in the editor. This tag will be ignored.", context, 0));
            return;
        }

        // Update relevant content
        parseResult.details.initialFileFirstLine = context.lineNum; // Line num is 1 higher than the line array index, which works in our favour since the code starts on the next line
        parseResult.details.initialFileType = context.tokenArgs[1]; // spy or py

        context.thisNest.contents.push(context.tokenArgs[0]); // Add to the parent nest
        context.currentNestLevels.push({nestLevel: context.tokenArgs[0], contents: []}); // Add nest level
    }
    else { // closer tag TBC LOADS OF POST STEP COMPLETION CHECKS
        // Basic nest level and args requirements for closing tags
        if(tagTokenHelper_closeTagGeneric(context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // [u] Check that a valid text token was detected in this nest
        if(context.thisNest.contents.length == 0) { // Will contain "valid_node" if text was detected
            parseResult.debugMessages.push(newDebugMessage("warning", "Empty Initial File Section detected. Check that the Python file was correctly uploaded. This section will be ignored, and the Lesson will assume no there is Initial File.", context, 0)); //TBC DOCUMENTATION: SECTIONS
            context.currentNestLevels[context.currentNestLevels.length - 2].contents.pop(); // Deletes the respective element from contents of parent node, 'ignoring' the section.
        }

        context.currentNestLevels.pop(); // Remove nestLevel
    }
}

///////////////////////////////////////////
// --- DEFAULTS DEFINITION - 'root/' --- //
///////////////////////////////////////////
// Definition for Defaults section

// Takes all the same information as <step>, updating the defaults values of aspects not changed by individual Step definitons
function tagToken_defaults(context: LessonParseTokenContext, parseResult: LessonParseResult) {
    const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token

    if(context.tokenArgs[0][0] != "/") { // opener tag
        // Nest Level Requirement: root (no nesting)
        if(context.thisNest.nestLevel != "root") {
            parseResult.debugMessages.push(newDebugMessage("warning", "Invalid positioning for defaults tag: " + token + ", found in '" + context.thisNest.nestLevel.split("_")[0] + "' section. Defaults sections cannot be nested in any other sections. This tag will be ignored.", context, 0));
            return;
        }

        // Arguments Requirment: no args
        tagTokenHelper_noArgsGeneric(context, parseResult);
        
        // [u] lack of steps between this and the previous defaults specification
        if(context.thisNest.contents[context.thisNest.contents.length - 1] == "defaults") {
            parseResult.debugMessages.push(newDebugMessage("suggestion", "Multiple Defaults sections with no Steps defined in between detected. Consider merging these into one <defaults> section.", context, 0));
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
            parseResult.debugMessages.push(newDebugMessage("warning", "Empty defaults section detected. If this is unexpected, the contained Tags may be invalid and are being ignored. No changes to the defaults Step were made.", context, 0));
        }

        context.currentNestLevels.pop(); // Remove nestLevel
    }
}

///////////////////////////////////////
// --- STEP DEFINITION - 'root/' --- //
///////////////////////////////////////
// Definitions for Step section

// Main enclosing section for a single step, taking a stepRef as an argument and containing all step subsections
function tagToken_step(stepAllSubsections: string[], context: LessonParseTokenContext, parseResult: LessonParseResult) {
    const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token
    const totalSteps = parseResult.steps.length;

    if(context.tokenArgs[0][0] != "/") { // opener tag
        // [u] Nest level is either metadata, defaults or step - likely forgotten closing tag
        if(["step", "defaults", "metadata"].includes(context.thisNest.nestLevel)) {
            if(context.config.CONTINUE_FROM_MISSING_CLOSER) {
                parseResult.debugMessages.push(newDebugMessage("error", "Likely missing closing tag </" + context.thisNest.nestLevel.split("_")[0] + ">. All section-based tags must have a closer. The parser will attempt to continue beyond this.", context, -1)); //TBC DOCUMENTATION: SECTIONS
                
                // Attempts to resolve the issue by removing the step nestLevel and continuing. Only continues to scan for more errors for convenience.
                context.currentNestLevels.pop();
                context.thisNest = context.currentNestLevels[context.currentNestLevels.length - 1];
            }
            else {
                parseResult.debugMessages.push(newDebugMessage("fatal", "FATAL - Likely missing closing tag </" + context.thisNest.nestLevel.split("_")[0] + ">. All section-based tags must have a closer.", context, -1)); //TBC DOCUMENTATION: SECTIONS
                parseResult.success = false;
                return;
            }
        }

        // Nest Level Requirement: root (no nesting)
        if(context.thisNest.nestLevel != "root") {
            parseResult.debugMessages.push(newDebugMessage("warning", "Invalid positioning for Step tag: " + token + ", found in '" + context.thisNest.nestLevel.split("_")[0] + "' section. Steps cannot be nested in any other sections. This tag will be ignored.", context, 0));
            return;
        }

        // [u] Maximum amount of steps
        if(totalSteps == context.config.MAX_LESSON_STEPS) {
            parseResult.debugMessages.push(newDebugMessage("fatal", "FATAL - Maximum Steps reached. Lesson files are limited to " + context.config.MAX_LESSON_STEPS + " total Steps. Please consider shortening this lesson or combining smaller Steps together.", context, 0)); //TBC DOCUMENTATION: GENERAL LESSON RULES?
            parseResult.success = false;
            return;
        }

        let newStepRef = context.stepRef; //<step> is the only tag that changes stepRef

        // Arguments Requirment: at least 1 for stepRef
        if(context.tokenArgs.length == 1) {
            newStepRef = "Unnamed Step #" + (totalSteps + 1); // e.g. 'Unnamed Step #4'
            context.stepRef = newStepRef; // Update for a more accurate error message
            parseResult.debugMessages.push(newDebugMessage("warning", "Step is missing a name. It is recommended to name each Step uniquely for more effective debugging. Current Step has been renamed to '" + newStepRef + "'.", context, 0));
        }
        else { // stepRef is present
            newStepRef = context.tokenArgs.slice(1).join(" "); // Join all elements beyond element 0 to rebuild stepRef
        }

        // [u] stepRef length
        if(newStepRef.length > context.config.MAX_LENGTH_STEPREF) {
            newStepRef = newStepRef.slice(0, context.config.MAX_LENGTH_STEPREF);
            context.stepRef = newStepRef; // Update for a more accurate error message
            parseResult.debugMessages.push(newDebugMessage("warning", "Step name shortened due to exceeding the character limit of " + context.config.MAX_LENGTH_STEPREF + ".", context, 0));
        }

        // [u] duplicate stepRefs
        for(let s = 0; s < parseResult.steps.length; s++) {
            if(newStepRef == parseResult.steps[s].stepRef) {
                // Replace stepRef with defaults when a duplicate is found
                newStepRef = "Unnamed Step #" + (totalSteps + 1);
                parseResult.debugMessages.push(newDebugMessage("warning", "Duplicate Step name, matching Step #" + (s + 1) + ": " + parseResult.steps[s].stepRef + ". Current Step has been renamed to '" + newStepRef + "'.", context, 0));
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
            parseResult.debugMessages.push(newDebugMessage("error", "Step is missing valid text content. Ensure that every the step has a non-empty <text> section.", context, 0, "text"));
        }
        
        // [u] various checks regarding the compatibility of certain tags within a step
        tagTokenHelper_stepCloserChecks(context, parseResult);

        context.currentNestLevels.pop(); // Remove nestLevel
        context.stepRef = ""; // Empties stepRef as the parser is no longer in a step - helps for debugging
    }
}

/* This helper function covers all specific debug messages related to incompatible tags within one step.
 * These are cases which are only checked at the step closer as the presence of two different tags could be interpreted in either order.
 * For example, <panel-type central-focus> is not allowed to have requirements due to it blocking the editor from being interacted with.
 * If this were to be fully tracked normally, the error checker would need to be present in:
 * - tagToken_panelType()
 * - tagToken_requirements()
 * - Every individual Requirement's respective function
 * This function is used to cover cases like this, evaluating the finalised content of the step to check for concerns.
 */
function tagTokenHelper_stepCloserChecks(context: LessonParseTokenContext, parseResult: LessonParseResult) {
    const currentStep = parseResult.steps[parseResult.steps.length - 1];
    // Individual error cases are stored in alphabetical order, labelled with the tags they relate to (in order of relevance).
    // When whole sections such as 'hint-list' or 'requirements' are more relevant, this is included instead.

    // <failed-attempts> + <requirements>: failed-attempts requirement can never be fulfilled when the step has no requirements
    if(stepHasRequirement(currentStep, StepRequirementType.FAILED_ATTEMPTS) && currentStep.requirements.length == 0) {
        parseResult.debugMessages.push(newDebugMessage("warning", "Hints with the <failed-attempts> Requirement will never be shown since the Step has no Requirements. The value that <failed-attempts> checks will only increment when the student has unfulfilled Requirements for that Step.", context, 0, "failed-attempts"));
    }

    // <hide-expected-values> + <hint-list>: hide-expected-values being toggled without any hints to make up for the hidden info.
    if(currentStep.attributes.hideRequirementExpectedValues && currentStep.hints.length == 0 && currentStep.requirements.length > 0) {
        parseResult.debugMessages.push(newDebugMessage("suggestion", "<hide-expected-values> is set to True despite the Step having no Hints. If the student is likely to struggle with this Step's Requirements, consider adding Hints to guide them when needed.", context, 0, "hint"));
    }

    // <hide-expected-values> + <requirements>: hide-expected-values does nothing with no requirements (doesn't trigger when the default value is true)
    if(currentStep.attributes.hideRequirementExpectedValues && currentStep.requirements.length == 0 && !context.defaultsStepTemplate.attributes.hideRequirementExpectedValues) {
        parseResult.debugMessages.push(newDebugMessage("warning", "<hide-expected-values> is set to True despite the Step having no Requirements. This tag will have no effect.", context, 0, "hide-expected-values"));
    }

    // <min-requirements> + <requirements> GROUP:
    // min-requirements does nothing with no requirements (doesn't trigger when the defaults has a value)
    if(currentStep.attributes.minRequirements && currentStep.requirements.length == 0 && !context.defaultsStepTemplate.attributes.minRequirements) {
        parseResult.debugMessages.push(newDebugMessage("warning", "<min-requirements> has a value despite the Step having no Requirements. This tag will have no effect.", context, 0, "min-requirements"));
    }
    // min-requirements isn't required to be set to the total requirements (doesn't trigger when the defaults has a value)
    if(currentStep.attributes.minRequirements && currentStep.attributes.minRequirements == currentStep.requirements.length && !context.defaultsStepTemplate.attributes.minRequirements) {
        parseResult.debugMessages.push(newDebugMessage("suggestion", "<min-requirements> is set equal to the total Step Requirements. This is the default value and hence is not necessary to specify.", context, 0, "min-requirements"));
    }
    // min-requirements can't be higher than the total requirements
    if(currentStep.attributes.minRequirements && currentStep.attributes.minRequirements > currentStep.requirements.length) {
        parseResult.debugMessages.push(newDebugMessage("warning", "<min-requirements> is set higher than the total Requirements (" + currentStep.attributes.minRequirements + ">" + currentStep.requirements.length + "), which is impossible to achieve. To ensure the student can progress, this value will be reduced to the total amount of Step Requirements (" + currentStep.requirements.length + ").", context, 0, "min-requirements"));
        currentStep.attributes.minRequirements = currentStep.requirements.length;
    }

    // <panel-type> + <requirements>: central-focus panel cannot have requirements due to it blocking interaction with the editor
    if(currentStep.attributes.panelType == StepPanelType.FULLSCREEN_FOCUS_MODAL && currentStep.requirements.length > 0) {
        parseResult.debugMessages.push(newDebugMessage("error", "<panel-type> argument 'central-focus' cannot be used for Steps with Requirements, as access to the editor is obstructed by this panel. If the Requirements are necessary, modify the Step's Panel Type.", context, 0, "panel-type"));
    }

    // - TBC: Panel Type Size incompatability with too much text for certain panel types
}

/////////////////////////////////////////////
// --- STEP SUBSECTIONS - 'root/step/' --- //
/////////////////////////////////////////////
// All main subsections in a single step, grouping its respective data accordingly

// Attributes subsection for specifying most data about a specific step / defaults
function tagToken_attributes(stepAllSubsections: string[], context: LessonParseTokenContext, parseResult: LessonParseResult) {
    //const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token

    if(context.tokenArgs[0][0] != "/") { // opener tag
        // [u] Nested inside a <defaults>, which is not required and not advised either (avoids unnecessarily complicated nesting)
        if(context.thisNest.nestLevel == "defaults") {
            parseResult.debugMessages.push(newDebugMessage("warning", "Defaults sections do not require a nested Attributes section inside them. Individual Attributes can be written directly inside the Defaults section. This tag will be ignored.", context, 0));
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
            parseResult.debugMessages.push(newDebugMessage("warning", "Step Attributes section has no content.", context, 0));
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
        tagTokenHelper_similarTagSuggestion(["attributes", "defaults"], "min-requirements", context, parseResult);

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
            parseResult.debugMessages.push(newDebugMessage("warning", "Empty " + token + " section detected. Ensure that text-based sections contain at least one non-whitespace character. This section has been ignored.", context, 0)); //TBC DOCUMENTATION: SECTIONS
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
            parseResult.debugMessages.push(newDebugMessage("warning", "Invalid positioning for Text subsection tag: <" + context.tokenArgs.join(" ") + ">, found in '" + context.thisNest.nestLevel.split("_")[0] + "' section. Text subsections can only be placed within <step> or <hint> subsections. If you are trying to write a comment, use <#></#>. This tag will be ignored.", context, 0));
        }
        else {
            parseResult.debugMessages.push(newDebugMessage("warning", "Invalid positioning for Step subsection tag: <" + context.tokenArgs.join(" ") + ">, found in '" + context.thisNest.nestLevel.split("_")[0] + "' section. Step subsections should only be contained within a <step> section. This tag will be ignored.", context, 0));
        }
        return true;
    }

    // Arguments Requirment: no args
    tagTokenHelper_noArgsGeneric(context, parseResult);
    
    // Uniqueness Requirement: one per parent section
    if(context.thisNest.contents.includes(context.tokenArgs[0])) {
        if(context.config.ALLOW_MULTIPLE_STEP_SUBSECTIONS) {
            parseResult.debugMessages.push(newDebugMessage("suggestion", "Multiple <" + context.tokenArgs[0] + "> subsections in one Step. It is advised to only have at most one of each subsection per Step. Consider merging these two sections into one.", context, 0)); //TBC DOCUMENTATION: SECTIONS
        }
        else {
            parseResult.debugMessages.push(newDebugMessage("fatal", "FATAL - Multiple <" + context.tokenArgs[0] + "> sections within one Step. Please merge duplicate subsections into one per step.", context, 0)); //TBC DOCUMENTATION: SECTIONS
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
    const currentStep = tagTokenHelper_attributeGetCurrentStep(context, parseResult);

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
            parseResult.debugMessages.push(newDebugMessage("warning", "Unknown Colour Scheme argument: " + token + ". Refer to the documentation for a list of valid arguments. This tag will be ignored and the Step will keep its defaults Colour Scheme.", context, 0));
            return;
        }
        
        currentStep.attributes.colourScheme = context.tokenArgs[1].toLowerCase();
        context.thisNest.contents.push(context.tokenArgs[0]); // Add to the parent nest
    }
    else { // closer tag
        // This tag type has no need for a closer tag, and therefore is disregarded
        tagTokenHelper_noCloserTagNeeded(context, parseResult);
    }
}

// Boolean Attribute defining whether the Requirement Message popover should hide the expected value.
function tagToken_hideExpectedValues(context: LessonParseTokenContext, parseResult: LessonParseResult) {
    const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token
    const currentStep = tagTokenHelper_attributeGetCurrentStep(context, parseResult);

    if(context.tokenArgs[0][0] != "/") { // opener tag
        // Basic nest level and uniqueness requirements for fixed argument attributes
        if(tagTokenHelper_stepAttributeNestUnique(context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // Argument Requirements: nothing, or either true or false
        tagTokenHelper_stepAttributeBooleanArguments(context, parseResult);
        
        if(context.tokenArgs.length == 0 || context.tokenArgs[1].toLowerCase() == "true") {
            // No args = true
            currentStep.attributes.hideRequirementExpectedValues = true;
        }
        else if(context.tokenArgs[1].toLowerCase() == "false") {
            if(!currentStep.attributes.hideRequirementExpectedValues) {
                parseResult.debugMessages.push(newDebugMessage("suggestion", "Unnecessary boolean attribute tag: " + token + ". This tag is paired to a value that was already false. Boolean argument attributes are false by defaults.", context, 0));
            }
            currentStep.attributes.hideRequirementExpectedValues = false;
        }

        context.thisNest.contents.push(context.tokenArgs[0]); // Add to the parent nest
    }
    else { // closer tag
        // This tag type has no need for a closer tag, and therefore is disregarded
        tagTokenHelper_noCloserTagNeeded(context, parseResult);
    }
}

// Attribute to alter the minimum amount of requirements needed to progress
function tagToken_minRequirements(context: LessonParseTokenContext, parseResult: LessonParseResult) {
    const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token
    const currentStep = tagTokenHelper_attributeGetCurrentStep(context, parseResult);

    if(context.tokenArgs[0][0] != "/") { // opener tag
        // Basic nest level and uniqueness requirements for fixed argument attributes
        if(tagTokenHelper_stepAttributeNestUnique(context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // Argument Requirement: 1
        if(tagTokenHelper_fixedArgsGeneric(1, context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // [u] Argument restrictions: must be a positive integer, should be greater than 0
        if(context.tokenArgs[1] == "0") {
            parseResult.debugMessages.push(newDebugMessage("warning", "<min-requirements 0> will prevent any Step Requirements from being enforced. Ensure that this is the intended behaviour.", context, 0));
        }
        if(!(/^\d+$/.test(context.tokenArgs[1]))) { // '^\d+$' is a Positive Integer Regex, allowing strings that only contain digits 0-9 (no . or -)
            parseResult.debugMessages.push(newDebugMessage("warning", "Invalid argument: " + token + ". This tag only accepts positive integers as an argument. This tag will be ignored.", context, 0));
            return;
        }
        // No check for max argument value just yet - tagTokenHelper_stepCloserChecks has a check against this value being higher than the Step's requirement count.
        
        currentStep.attributes.minRequirements = Number(context.tokenArgs[1]);
        context.thisNest.contents.push(context.tokenArgs[0]); // Add to the parent nest
    }
    else { // closer tag
        // This tag type has no need for a closer tag, and therefore is disregarded
        tagTokenHelper_noCloserTagNeeded(context, parseResult);
    }
}

// Attribute to determine the panel type of a step (where the panel is displayed in the editor)
function tagToken_panelType(context: LessonParseTokenContext, parseResult: LessonParseResult) {
    const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token
    const currentStep = tagTokenHelper_attributeGetCurrentStep(context, parseResult);

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
            parseResult.debugMessages.push(newDebugMessage("warning", "Unknown Panel Type argument: " + token + ". Refer to the documentation for a list of valid arguments. This tag will be ignored and the Step will keep its defaults Panel Type.", context, 0));
            return;
        }
        
        currentStep.attributes.panelType = panelArgMap[context.tokenArgs[1].toLowerCase()]; // Updates by reference

        context.thisNest.contents.push(context.tokenArgs[0]); // Add to the parent nest
    }
    else { // closer tag
        // This tag type has no need for a closer tag, and therefore is disregarded
        tagTokenHelper_noCloserTagNeeded(context, parseResult);
    }
}

// Returns either the current step, or the defualt step template depending on the context of the attributes placement.
// Note that this relys on the <attributes> tag being ignored if its placed inside a <defaults> section, since this isn't expected behaviour.
function tagTokenHelper_attributeGetCurrentStep(context: LessonParseTokenContext, parseResult: LessonParseResult) : LessonStepDetails {
    return (context.thisNest.nestLevel == "defaults" || parseResult.steps.length == 0)
        ? context.defaultsStepTemplate                     // this tag is inside <defaults>
        : parseResult.steps[parseResult.steps.length - 1]; // this tag is inside the most recent <step> (unless the placement is invalid, hence the parseResult.steps.length == 0 failsafe))
}

// Covers the base requirements for unique step attributes that take an argument:
// - Inside <attributes> (unless setting allows otherwise).
// - Only one of this attribute specification within the current step.
// Returns 'true' when evaluateTagToken() needs to return early (ignore the tag).
function tagTokenHelper_stepAttributeNestUnique(context: LessonParseTokenContext, parseResult: LessonParseResult) : boolean {
    // Nest Level Requirement: defaults, attributes, or just step if ALLOW_ATTRIBUTES_IN_STEP_NEST == true.
    if(context.thisNest.nestLevel != "attributes" && context.thisNest.nestLevel != "defaults") {
        if(context.config.ALLOW_ATTRIBUTES_IN_STEP_NEST && context.thisNest.nestLevel == "step") {
            parseResult.debugMessages.push(newDebugMessage("suggestion", "Unnested Attribute tag: <" + context.tokenArgs.join(" ") + ">. For better code organisation, consider grouping all Attribute tags within the <attributes> section.", context, 0));
        }
        else {
            parseResult.debugMessages.push(newDebugMessage("warning", "Invalid positioning for Attribute tag: <" + context.tokenArgs.join(" ") + ">, found in '" + context.thisNest.nestLevel.split("_")[0] + "' section. Attributes should be stored within a Step's <attributes> section. This tag will be ignored.", context, 0));
            return true;
        }
    }

    // Uniqueness Requirement: one per parent section. Also checks the step in case attributes were validly placed outside of the <attributes> section.
    if(context.thisNest.contents.includes(context.tokenArgs[0]) || context.currentNestLevels[1].contents.includes(context.tokenArgs[0])) {
        parseResult.debugMessages.push(newDebugMessage("warning", "Multiple instances of Attribute tag within one section: <" + context.tokenArgs[0] + ">. Only the first valid instance of an Attribute tag will be used. This tag will be ignored.", context, 0, "attributes"));
        return true;
    }

    return false;
}

// Covers the argument requirements for attributes with boolean data, allowing 0-1 arguments
function tagTokenHelper_stepAttributeBooleanArguments(context: LessonParseTokenContext, parseResult: LessonParseResult) {
    // Arguments Requirment: 0 or 1, but can only be true or false. 0 args defaults to true.
    if(context.tokenArgs.length > 2) {
        parseResult.debugMessages.push(newDebugMessage("warning", "Unnecessary arguments found within Attribute tag: <" + context.tokenArgs.join(" ") + ">. This tag only takes 1 argument at most. Excess arguments will be ignored.", context, 0));
    }
    if(context.tokenArgs.length > 1) {
        if(context.tokenArgs[1].toLowerCase() != "true" && context.tokenArgs[1].toLowerCase() != "false") {
            parseResult.debugMessages.push(newDebugMessage("warning", "Unknown argument '" + context.tokenArgs[1] + "' for Attribute tag: <" + context.tokenArgs[0] + ">. This tag only accepts 'true' or 'false'. This tag will assume no arguments are present and set its value to 'true'.", context, 0));
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
                parseResult.debugMessages.push(newDebugMessage("error", "Likely missing Hint closing tag </hint>. All section-based tags, including Hints, must have a closer. The parser will attempt to continue beyond this.", context, -1)); //TBC DOCUMENTATION: SECTIONS
                
                // Attempts to resolve the issue by removing the step nestLevel and continuing. Only continues to scan for more errors for convenience.
                context.currentNestLevels.pop();
                context.thisNest = context.currentNestLevels[context.currentNestLevels.length - 1];
            }
            else {
                parseResult.debugMessages.push(newDebugMessage("fatal", "FATAL - Likely missing Hint closing tag </hint>. All section-based tags, including Hints, must have a closer.", context, -1)); //TBC DOCUMENTATION: SECTIONS
                parseResult.success = false;
                return;
            }
        }

        // Nest Level Requirement: hint-list, or step if allowed
        if(context.thisNest.nestLevel != "hint-list") {
            if(context.thisNest.nestLevel == "step" && context.config.ALLOW_HINTS_IN_STEP_NEST) {
                // Hint is valid in this case, but when there's more than one hint in a step, a suggestion to group them is given.
                if(currentStep.hints.length > 0) {
                    parseResult.debugMessages.push(newDebugMessage("suggestion", "Consider grouping multiple Hints within one Step into a <hint-list> section for better code organisation.", context, 0));
                }
            }
            else {
                parseResult.debugMessages.push(newDebugMessage("warning", "Invalid positioning for Hint tag: " + token + ", found in '" + context.thisNest.nestLevel.split("_")[0] + "' section. Hints should be nested inside a Step's <hint-list> section. This tag will be ignored.", context, 0));
                return;
            }
        }

        // [u] Maximum amount of hints in one step
        if(currentStep.hints.length >= context.config.MAX_HINTS_PER_STEP) {
            parseResult.debugMessages.push(newDebugMessage("warning", "Maximum Hints for one Step reached. Steps are limited to " + context.config.MAX_HINTS_PER_STEP + " total Hints. Consider merging some Hints together or spreading them across multiple Steps. All further <hint> tags in this Step will be ignored.", context, 0));
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

        // [u] hints with no requirements nullifies all hints before it (may change in the future if custom hint picker is implemented)
        if(currentStep.hints[currentStep.hints.length - 1].requirements.length == 0 && currentStep.hints.length > 1) {
            parseResult.debugMessages.push(newDebugMessage("warning", "A Hint with no Requirements is preventing other Hints from ever being displayed. Note that the first Hint with all its Requirements fulfilled will be displayed, chosen with the order they are written inside the Step.", context, 0, "text"));
        }

        // [u] hints should have custom text as a minimum
        if(currentStep.hints[currentStep.hints.length - 1].message == context.config.PLACEHOLDER_TEXT || currentStep.hints[currentStep.hints.length - 1].message == "") {
            parseResult.debugMessages.push(newDebugMessage("warning", "Hint is missing valid text content. Ensure either the hint has a non-empty <text> section. This hint section will be ignored.", context, 0, "text"));
            currentStep.hints.pop(); // Delete empty hint
        }

        context.currentNestLevels.pop(); // Remove nestLevel
    }
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
                parseResult.debugMessages.push(newDebugMessage("suggestion", "Multiple <requirements> subsections in one Hint. It is advised to only have at most one of each subsection per Hint. Consider merging these two sections into one.", context, 0)); //TBC DOCUMENTATION: SECTIONS
            }
            else {
                parseResult.debugMessages.push(newDebugMessage("error", "Multiple <requirements> sections within one Hint. Please merge duplicate subsections into one per Hint.", context, 0)); //TBC DOCUMENTATION: SECTIONS
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
            parseResult.debugMessages.push(newDebugMessage("warning", "Hint Requirements section has no content. This section will be ignored", context, 0));

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
            parseResult.debugMessages.push(newDebugMessage("fatal", "FATAL - Multiple <text> sections within one Hint. Only one Text section is allowed per Hint. To display multiple text segments, make use of multiple <hint> sections with varying Requirements.", context, 0, "hint"));
            parseResult.success = false;
            return true;
        }

        context.thisNest.contents.push(context.tokenArgs[0]); // Add attributes to the parent nest
        context.currentNestLevels.push({nestLevel: context.tokenArgs[0] + "_inHint", contents: []}); // VARIANT NEST
    }
    else { // closer tag

        // Basic nest level and args requirements for closing tags
        if(tagTokenHelper_closeTagGeneric(context, parseResult, "_inHint")) {
            return; // ^ If true, tag needs to be ignored
        }

        // [u] Check that a valid text token was detected in this nest
        if(context.thisNest.contents.length == 0) { // Will contain "valid_node" if text was detected
            parseResult.debugMessages.push(newDebugMessage("warning", "Empty " + token + " section detected. Ensure that text-based sections contain at least one non-whitespace character. This section has been ignored.", context, 0)); //TBC DOCUMENTATION: SECTIONS
            context.currentNestLevels[context.currentNestLevels.length - 2].contents.pop(); // Deletes the respective element from contents of parent node, 'ignoring' the section.
        }

        context.currentNestLevels.pop(); // Remove nestLevel
    }
}

////////////////////////////////////////////////////////////////
// --- STEP/HINT REQUIREMENTS - 'root/step/requirements/' --- //
////////////////////////////////////////////////////////////////
// Different types of Requirements that must be fulfilled to proceed to the next step (or to show a hint if used in a <hint> section)

// Changes Made requirement, needing the user to just make any change to their code. 
function tagToken_changesMade(context: LessonParseTokenContext, parseResult: LessonParseResult) {
    const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token

    if(context.tokenArgs[0][0] != "/") { // opener tag
        // Nest Level Requirement: requirements, hint, or step if allowed
        if(tagTokenHelper_requirementNestLevel(context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // Arguments Requirment: no args
        tagTokenHelper_noArgsGeneric(context, parseResult);

        // Negation Requirement: cannot be negated for Step Requirements
        if(context.tokenArgs[0][0] == "!" && (context.thisNest.nestLevel == "step" || context.thisNest.nestLevel == "requirements")) {
            parseResult.debugMessages.push(newDebugMessage("warning", "Invalid Step Requirement: " + token + ". To protect the student from getting stuck behind irreversable conditions, this Requirement cannot be negated for a Step Requirement. This tag will be ignored.", context, 0));
            return;
        }

        // Uniqueness Requirement: one per parent section, including negations
        if(tagTokenHelper_requirementUniqueness(context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // Create the Requirement
        tagTokenHelper_addNewRequirement(context, parseResult, {
            reqType: StepRequirementType.CHANGES_MADE, 
            negated: context.tokenArgs[0][0] == "!",
            needed: false,
        });

        context.thisNest.contents.push(context.tokenArgs[0]); // Add to the parent nest step/defaults
    }
    else { // closer tag
        // This tag type has no need for a closer tag, and therefore is disregarded
        tagTokenHelper_noCloserTagNeeded(context, parseResult);
        parseResult.debugMessages.push(newDebugMessage("suggestion", "Closer symbol detected on negatable Requirement Tag: <" + context.tokenArgs[0] + ">. Did you mean <" + context.tokenArgs[0].replace("/", "!") + ">?", context, 0));
    }
}

// Failed Attempts Requirement for hints. Makes a hint display after a certain amount of failed attempts to go to the next step (from other unfulfilled requirements)
function tagToken_failedAttempts(context: LessonParseTokenContext, parseResult: LessonParseResult) {
    const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token

    if(context.tokenArgs[0][0] != "/") { // opener tag
        // Nest Level Requirement: ONLY hint. This requirement type is not allowed to be used on steps.
        if(context.thisNest.nestLevel != "hint" && context.thisNest.nestLevel != "requirements_inHint") {
            if(context.thisNest.nestLevel == "requirements" || (context.thisNest.nestLevel == "step" && context.config.ALLOW_REQUIREMENTS_IN_STEP_NEST)) {
                parseResult.debugMessages.push(newDebugMessage("warning", "Invalid positioning for Requirement tag: <" + context.tokenArgs[0] + ">, found in '" + context.thisNest.nestLevel.split("_")[0] + "' section. This Requirement type is not allowed to be used for Steps. It can only be placed inside a <hint> section for conditionally displaying Hints. This tag will be ignored.", context, 0));
            }
            else {
                parseResult.debugMessages.push(newDebugMessage("warning", "Invalid positioning for Requirement tag: <" + context.tokenArgs[0] + ">, found in '" + context.thisNest.nestLevel.split("_")[0] + "' section. This Requirement type can only be placed inside a <hint> section for conditionally displaying Hints. This tag will be ignored.", context, 0));
            }
            return;
        }

        // Arguments Requirment: one positive number value
        if(tagTokenHelper_fixedArgsGeneric(1, context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // [u] Argument restrictions: must be a positive integer, should be close to 0
        if(context.tokenArgs[1] == "0" || !(/^\d+$/.test(context.tokenArgs[1]))) { // '^\d+$' is a Positive Integer Regex, allowing strings that only contain digits 0-9 (no . or -)
            parseResult.debugMessages.push(newDebugMessage("warning", "Invalid argument: " + token + ". This tag only accepts integers greater than 0 as an argument. This tag will be ignored.", context, 0));
            return;
        }
        if(Number(context.tokenArgs[1]) > context.config.MAX_REQ_ARG_FAILED_ATTEMPTS) {
            if(context.config.ALLOW_REQUIREMENTS_ABOVE_MAX_VALUES) {
                parseResult.debugMessages.push(newDebugMessage("suggestion", "This tag has an unusually high argument value: " + token + ". It is recommended to stay below " + context.config.MAX_REQ_ARG_FAILED_ATTEMPTS + " for a better learning experience.", context, 0));
            }
            else {
                parseResult.debugMessages.push(newDebugMessage("warning", "Invalid argument: " + token + ". The maximum value for this argument is " + context.config.MAX_REQ_ARG_FAILED_ATTEMPTS + ". This tag will be ignored.", context, 0));
                return;
            }
        }

        // Uniqueness Requirement: one per parent section, including negations
        if(tagTokenHelper_requirementUniqueness(context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // Create the Requirement
        tagTokenHelper_addNewRequirement(context, parseResult, {
            reqType: StepRequirementType.FAILED_ATTEMPTS, 
            negated: context.tokenArgs[0][0] == "!",
            needed: false,
            numValue: Number(context.tokenArgs[1]),
        });

        context.thisNest.contents.push(context.tokenArgs[0]); // Add to the parent nest step/defaults
    }
    else { // closer tag
        // This tag type has no need for a closer tag, and therefore is disregarded
        tagTokenHelper_noCloserTagNeeded(context, parseResult);
        parseResult.debugMessages.push(newDebugMessage("suggestion", "Closer symbol detected on negatable Requirement Tag: <" + context.tokenArgs[0] + ">. Did you mean <" + context.tokenArgs[0].replace("/", "!") + ">?", context, 0));
    }
}

// No Errors Requirement, needing the user to have no errors in their code
function tagToken_noErrors(context: LessonParseTokenContext, parseResult: LessonParseResult) {

    if(context.tokenArgs[0][0] != "/") { // opener tag
        // Nest Level Requirement: requirements, hint, or step if allowed
        if(tagTokenHelper_requirementNestLevel(context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // Arguments Requirment: no args
        tagTokenHelper_noArgsGeneric(context, parseResult);

        // Uniqueness Requirement: one per parent section, including negations
        if(tagTokenHelper_requirementUniqueness(context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // Create the Requirement
        tagTokenHelper_addNewRequirement(context, parseResult, {
            reqType: StepRequirementType.NO_ERRORS, 
            negated: context.tokenArgs[0][0] == "!",
            needed: false,
        });

        context.thisNest.contents.push(context.tokenArgs[0]); // Add to the parent nest step/defaults
    }
    else { // closer tag
        // This tag type has no need for a closer tag, and therefore is disregarded
        tagTokenHelper_noCloserTagNeeded(context, parseResult);
        parseResult.debugMessages.push(newDebugMessage("suggestion", "Closer symbol detected on negatable Requirement Tag: <" + context.tokenArgs[0] + ">. Did you mean <" + context.tokenArgs[0].replace("/", "!") + ">?", context, 0));
    }
}

// No Errors Requirement, needing the user to have no errors in their code
function tagToken_hasPython(context: LessonParseTokenContext, parseResult: LessonParseResult) {
    const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token
    const currentStep = parseResult.steps[parseResult.steps.length - 1];

    if(context.tokenArgs[0][0] != "/") { // opener tag
        // Nest Level Requirement: requirements, hint, or step if allowed
        if(tagTokenHelper_requirementNestLevel(context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // Arguments Requirment: no args
        tagTokenHelper_noArgsGeneric(context, parseResult, "Unnecessary arguments found within tag: " + token + ". The Python content to match is specified as a text section, not within tag arguments. These arguments will be ignored.");

        // No Negation or Uniqueness requirements

        // Create the Requirement
        tagTokenHelper_addNewRequirement(context, parseResult, {
            reqType: StepRequirementType.HAS_PYTHON, 
            negated: context.tokenArgs[0][0] == "!",
            needed: false,
            // Text content is specified in the textToken tag
        });

        // Note that besides the _inHint variant, this nest level also has a normal and a negated version. All of these are considered in evaluateTextToken()
        if(context.thisNest.nestLevel == "hint" || context.thisNest.nestLevel == "requirements_inHint") {
            context.currentNestLevels.push({nestLevel: context.tokenArgs[0] + "_inHint", contents: []}); // VARIANT NEST
        }
        else {
            context.currentNestLevels.push({nestLevel: context.tokenArgs[0], contents: []});
        }
        context.thisNest.contents.push(context.tokenArgs[0]); // Add to the parent nest step/defaults
    }
    else { // closer tag
        // Basic nest level and args requirements for closing tags + detection of inHint variant
        if(context.thisNest.nestLevel != "has-python_inHint"){
            if(tagTokenHelper_closeTagGeneric(context, parseResult)) {
                return; // ^ If true, tag needs to be ignored
            }
        }

        // [u] Check that a valid text token was detected in this nest
        if(context.thisNest.contents.length == 0) { // Will contain "valid_node" if text was detected
            parseResult.debugMessages.push(newDebugMessage("warning", "Empty " + token + " section detected. Ensure that text-based sections contain at least one non-whitespace character. This section has been ignored.", context, 0)); //TBC DOCUMENTATION: SECTIONS
            context.currentNestLevels[context.currentNestLevels.length - 2].contents.pop(); // Deletes the respective element from contents of parent node, 'ignoring' the section.
            // Also deletes the actual requirement, which is either the most recent requirment in the most recent hint, or just the most recent step requirement
            if(context.thisNest.nestLevel == "has-python_inHint" || context.thisNest.nestLevel == "!has-python_inHint") {
                currentStep.hints[currentStep.hints.length - 1].requirements.pop();
            }
            else {
                currentStep.requirements.pop();
            }
        }

        context.currentNestLevels.pop(); // Remove nestLevel
    }
}

// Run Code Requirement, needing the user to click the run code button before progressing
function tagToken_runCode(context: LessonParseTokenContext, parseResult: LessonParseResult) {
    const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token

    if(context.tokenArgs[0][0] != "/") { // opener tag
        // Nest Level Requirement: requirements, hint, or step if allowed
        if(tagTokenHelper_requirementNestLevel(context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // Arguments Requirment: no args
        tagTokenHelper_noArgsGeneric(context, parseResult);

        // Negation Requirement: cannot be negated for Step Requirements
        if(context.tokenArgs[0][0] == "!" && (context.thisNest.nestLevel == "step" || context.thisNest.nestLevel == "requirements")) {
            parseResult.debugMessages.push(newDebugMessage("warning", "Invalid Step Requirement: " + token + ". To protect the student from getting stuck behind irreversable conditions, this Requirement cannot be negated for a Step Requirement. This tag will be ignored.", context, 0));
            return;
        }

        // Uniqueness Requirement: one per parent section, including negations
        if(tagTokenHelper_requirementUniqueness(context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // Create the Requirement
        tagTokenHelper_addNewRequirement(context, parseResult, {
            reqType: StepRequirementType.RUN_CODE, 
            negated: context.tokenArgs[0][0] == "!",
            needed: false,
        });

        context.thisNest.contents.push(context.tokenArgs[0]); // Add to the parent nest step/defaults
    }
    else { // closer tag
        // This tag type has no need for a closer tag, and therefore is disregarded
        tagTokenHelper_noCloserTagNeeded(context, parseResult);
        parseResult.debugMessages.push(newDebugMessage("suggestion", "Closer symbol detected on negatable Requirement Tag: <" + context.tokenArgs[0] + ">. Did you mean <" + context.tokenArgs[0].replace("/", "!") + ">?", context, 0));
    }
}

// Time Passed Requirement, needing the user to spend a certain amount of seconds on a step
function tagToken_timePassed(context: LessonParseTokenContext, parseResult: LessonParseResult) {
    const token = "<" + context.tokenArgs.join(" ") + ">"; //rebuild token

    if(context.tokenArgs[0][0] != "/") { // opener tag
        // Nest Level Requirement: requirements, hint, or step if allowed
        tagTokenHelper_similarTagSuggestion(["metadata"], "estimated-time", context, parseResult);
        if(tagTokenHelper_requirementNestLevel(context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // Arguments Requirment: one positive number value
        if(tagTokenHelper_fixedArgsGeneric(1, context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // [u] Argument restrictions: must be a positive integer, should be close to 0
        if(context.tokenArgs[1] == "0" || !(/^\d+$/.test(context.tokenArgs[1]))) { // '^\d+$' is a Positive Integer Regex, allowing strings that only contain digits 0-9 (no . or -)
            parseResult.debugMessages.push(newDebugMessage("warning", "Invalid argument: " + token + ". This tag only accepts integers greater than 0 as an argument, measured in seconds. This tag will be ignored.", context, 0));
            return;
        }
        if(Number(context.tokenArgs[1]) > context.config.MAX_REQ_ARG_TIME_PASSED) {
            if(context.config.ALLOW_REQUIREMENTS_ABOVE_MAX_VALUES) {
                parseResult.debugMessages.push(newDebugMessage("suggestion", "This tag has an unusually high argument value: " + token + ". It is recommended to stay below " + context.config.MAX_REQ_ARG_TIME_PASSED + " seconds for a better learning experience.", context, 0));
            }
            else {
                parseResult.debugMessages.push(newDebugMessage("warning", "Invalid argument: " + token + ". The maximum value for this argument is " + context.config.MAX_REQ_ARG_TIME_PASSED + " seconds. This tag will be ignored.", context, 0));
                return;
            }
        }

        // Negation Requirement: cannot be negated for Step Requirements
        if(context.tokenArgs[0][0] == "!" && (context.thisNest.nestLevel == "step" || context.thisNest.nestLevel == "requirements")) {
            parseResult.debugMessages.push(newDebugMessage("warning", "Invalid Step Requirement: " + token + ". To protect the student from getting stuck behind irreversable conditions, this Requirement cannot be negated for a Step Requirement. This tag will be ignored.", context, 0));
            return;
        }

        // Uniqueness Requirement: one per parent section, including negations
        if(tagTokenHelper_requirementUniqueness(context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // Create the Requirement
        tagTokenHelper_addNewRequirement(context, parseResult, {
            reqType: StepRequirementType.TIME_PASSED, 
            negated: context.tokenArgs[0][0] == "!",
            needed: false,
            numValue: Number(context.tokenArgs[1]),
        });

        context.thisNest.contents.push(context.tokenArgs[0]); // Add to the parent nest step/defaults
    }
    else { // closer tag
        // This tag type has no need for a closer tag, and therefore is disregarded
        tagTokenHelper_noCloserTagNeeded(context, parseResult);
        parseResult.debugMessages.push(newDebugMessage("suggestion", "Closer symbol detected on negatable Requirement Tag: <" + context.tokenArgs[0] + ">. Did you mean <" + context.tokenArgs[0].replace("/", "!") + ">?", context, 0));
    }
}

// Covers the nest requirement for Requirement tags.
// - Inside either the <requirements> section of a step, or inside a <hint>
// - If neither, check if its inside a step, as this might be allowed too and assumed as a step requirement
function tagTokenHelper_requirementNestLevel(context: LessonParseTokenContext, parseResult: LessonParseResult) : boolean {
    if(!["requirements", "hint", "requirements_inHint"].includes(context.thisNest.nestLevel)) {
        if(context.thisNest.nestLevel == "step" && context.config.ALLOW_REQUIREMENTS_IN_STEP_NEST) {
            parseResult.debugMessages.push(newDebugMessage("suggestion", "Unnested Requirement tag: <" + context.tokenArgs.join(" ") + ">. This Requirement will be assumed as a Step Requirement. For better code organisation, consider grouping all Requirement tags within the <requirements> section.", context, 0, "requirements"));
        }
        else {
            parseResult.debugMessages.push(newDebugMessage("warning", "Invalid positioning for Requirement tag: <" + context.tokenArgs[0] + ">, found in '" + context.thisNest.nestLevel.split("_")[0] + "' section. Requirements are assigned within a Step's <requirements> section, or inside a <hint> section to assign it to that Hint. This tag will be ignored.", context, 0, "requirements"));
            return true;
        }
    }

    return false;
}

// Covers the Uniqueness requirement for those that need it, including checking for negations when trying to add regular Requirements and vice versa
function tagTokenHelper_requirementUniqueness(context: LessonParseTokenContext, parseResult: LessonParseResult) : boolean {
    if(context.thisNest.contents.includes(context.tokenArgs[0])) {
        parseResult.debugMessages.push(newDebugMessage("warning", "Multiple <" + context.tokenArgs[0] + "> Requirements in one section. Having multiple of this tag has no effect on the Requirement. This tag will be ignored.", context, 0));
        return true;
    }
    if(context.thisNest.contents.includes(context.tokenArgs[0][0] == "!" ? context.tokenArgs[0].slice(1) : "!" + context.tokenArgs[0])) {
        // Checks for <!tag> with <tag>, and vice versa
        parseResult.debugMessages.push(newDebugMessage("warning", "Contradicting " + context.tokenArgs[0] + " Requirements in one section. Only the first instance of this Requirement type will be used. This tag will be ignored.", context, 0));
        return true;
    }
    return false;
}

// Handles pushing the new requirement to either the current step's requirements, or the current hint's requirements
function tagTokenHelper_addNewRequirement(context: LessonParseTokenContext, parseResult: LessonParseResult, req: LessonRequirement) : void {
    const currentStep = parseResult.steps[parseResult.steps.length - 1];
    if(context.thisNest.nestLevel == "hint" || context.thisNest.nestLevel == "requirements_inHint") {
        // [u] Maximum requirements check (hint)
        if(currentStep.hints[currentStep.hints.length - 1].requirements.length == context.config.MAX_REQUIREMENTS_PER_HINT) {
            parseResult.debugMessages.push(newDebugMessage("warning", "Maximum Hint Requirements reached at <" + context.tokenArgs.join(" ") + ">. Hints are limited to " + context.config.MAX_REQUIREMENTS_PER_HINT + " Requirements at most. This tag will be ignored.", context, 0));
            return;
        }

        currentStep.hints[currentStep.hints.length - 1].requirements.push(req);
    }
    else { // nest = requirements or step
        // [u] Maximum requirements check (step)
        if(currentStep.requirements.length == context.config.MAX_REQUIREMENTS_PER_STEP) {
            parseResult.debugMessages.push(newDebugMessage("warning", "Maximum Step Requirements reached at <" + context.tokenArgs.join(" ") + ">. Steps are limited to " + context.config.MAX_REQUIREMENTS_PER_STEP + " Requirements at most. This tag will be ignored.", context, 0));
            return;
        }

        currentStep.requirements.push(req);
    }
}

// Function that runs at the end of the Lesson File, making various checks to ensure that the uploaded file is syntactically correct.
export function evaluateEndOfFile(token: string, nestLevels: LessonParseNestSection[], currentLineNum: number, parseResult: LessonParseResult, initialDefaultStep: LessonStepDetails, parserConfig: LessonParserConfiguration): void {
    // -- SPECIAL FAILSAFE -- 
    if(nestLevels.length == 0) { // "root" has somehow been popped
        // This should never be encountered by a user, but this will break a LOT of stuff if it happens to occur, so this is mainly for debugging.
        nestLevels.push({nestLevel: "root", contents: []});
        console.error("Lesson Error: 'root' was somehow popped. There is a major fault with the parser.");
    }
    
    // -- INIT --
    const context: LessonParseTokenContext = {
        // This version of context requires a lot less information, as the error messages are more generalised
        tokenArgs: [], // Unused
        lineNum: -1, // Makes error messages have no location context. Only override when necessary using debugMessage's lineNumOffset parameter
        config: parserConfig,
        stepRef: "", // These errors are not specific to a step
        docWord: "", // Override when needed
        currentNestLevels: nestLevels,
        thisNest: nestLevels[nestLevels.length - 1],
        defaultsStepTemplate: initialDefaultStep, // Unused but needs to be stored either way
    };

    // Note that since this is already the end of the file, FATAL errors are only used for cases where further errors could be incorrectly shown as consequence.

    // If 'token' contains content, then the file ends with a text section caused by either a missing closer, or with an unsectioned text segment
    if(token.replace(/\s/g, "") != "") {
        if(context.thisNest.nestLevel == "root") {
            parseResult.debugMessages.push(newDebugMessage("fatal", "FATAL - Unsectioned text segment: '" + (token.length > 32 ? (token.slice(0, 32) + "...") : token) + "' To add comments safely, please use the comment tags <#> </#>.", context, currentLineNum + 1, "#"));
        }
        else {
            parseResult.debugMessages.push(newDebugMessage("fatal", "FATAL - Text segment read until end of file: '" + (token.length > 32 ? (token.slice(0, 32) + "...") : token) + "' This is likely caused by a missing closer tag </" + context.thisNest.nestLevel.split("_")[0] + ">.", context, currentLineNum + 1)); //TBC DOCUMENTATION SECTIONS
            
            // Special case where the user is using a Negated Requirement with a text section, such as <!has-python>, and did not negate the closer: </has-python> instead of </!has-python>
            if(context.thisNest.nestLevel[0] == "!" && token.includes("/" + context.thisNest.nestLevel.slice(1))) {
                parseResult.debugMessages.push(newDebugMessage("warning", "Fatal Error triggered by overflowing text segment from a negated Requirement nest level. This is likely caused by not negating the Closer Tag. Ensure that negated Requirements also have a negated Closer Tag: </" + context.thisNest.nestLevel + ">.", context, 0)); // TBC DOCUMENTATION NEGATED REQUIREMENTS
            }
        }
        parseResult.success = false;
        return;
    }

    // If the end nest level is not root, there is a missing closer (most likely step). No point in using config.CONTINUE_FROM_MISSING_CLOSER as it is already the end of the file
    if(context.currentNestLevels.length > 1) {
        parseResult.debugMessages.push(newDebugMessage("fatal", "FATAL - Lesson File did not end in 'root' section, got '" + context.thisNest.nestLevel.split("_")[0] + "' instead. This is likely caused by a missing closer tag </" + context.thisNest.nestLevel.split("_")[0] + ">.", context, 0)); //TBC DOCUMENTATION SECTIONS
        parseResult.success = false;
        return;
    }

    // Too few steps
    if(parseResult.steps.length < context.config.MIN_LESSON_STEPS) {
        parseResult.debugMessages.push(newDebugMessage("error", "Lesson File has too few valid Steps. The minimum amount of Steps expected for a valid Lesson is " + context.config.MIN_LESSON_STEPS + ".", context, 0)); //TBC DOCUMENTATION GENERAL LESSON RULES
    }

    // Ended on <defaults>
    if(context.thisNest.contents[context.thisNest.contents.length - 1] == "defaults") {
        parseResult.debugMessages.push(newDebugMessage("warning", "<defaults> section detected at end of file. Updating the default values for Attributes will only affect Steps placed after the <defaults> section.", context, 0, "defaults"));
    }

    // Missing metadata checks
    if(!context.thisNest.contents.includes("metadata") && !context.config.ALLOW_METADATA_IN_ROOT) {
        parseResult.debugMessages.push(newDebugMessage("warning", "No <metadata> section detected. To specify values for the Lesson's Metadata, ensure that you make use of a <metadata> sections and its valid contents.", context, 0, "metadata"));
    }
    if(parseResult.details.title == context.config.PLACEHOLDER_TEXT) {
        parseResult.debugMessages.push(newDebugMessage("warning", "Lesson File has no Title. You can specify the Title of the Lesson using a <title> section nested inside the Lesson's <metadata> section. The Title has been set to 'Unnamed Lesson'.", context, 0, "title"));
        parseResult.details.title = "Unnamed Lesson";
    }
    if(parseResult.details.description == context.config.PLACEHOLDER_TEXT) {
        parseResult.debugMessages.push(newDebugMessage("warning", "Lesson File has no Description. You can specify the Description of the Lesson using a <description> section nested inside the Lesson's <metadata> section. The Description has been set to 'No description provided'.", context, 0, "description"));
        parseResult.details.description = "No description provided";
    }
}