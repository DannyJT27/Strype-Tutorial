// Helper file for lessonFileParser.ts, handling the evaluation of each and every individual tag/text token.

import {LessonStepAttributes, StepPanelType, LessonParseErrorMessage, LessonParseResult, LessonParseNestSection, LessonParseTokenContext} from "@/types/types";

// Function for generating suggestions, errors and warnings
function newDebugMessage(message: string, context: LessonParseTokenContext, lineNumOffset: number, overrideDocText?: string, overrideDocLink?: string) : LessonParseErrorMessage {
    let sectionRefText = "Line " + (context.lineNum + lineNumOffset);
    if(context.stepRef != "") {
        sectionRefText += ", " + context.stepRef;
    }

    const debugMessage: LessonParseErrorMessage = {
        errorMessageContent: message,
        sectionRef: sectionRefText,
        documentationText: overrideDocText ?? context.docText, //optional
        documentationLink: overrideDocLink ?? context.docLink, //optional
    };

    return debugMessage;
}

// Main token reader for text, making changes to parseResult as required. Logic is much simpler as most error cases are already handled in evaluateTagToken().
export function evaluateTextToken(token: string, currentNestLevels: LessonParseNestSection[], currentLineNum: number, parseResult: LessonParseResult, defaultStepTemplate: LessonStepAttributes) : void {
    // -- SPECIAL FAILSAFE -- 
    if(currentNestLevels.length == 0) { // "base_nest" has somehow been popped
        // This should never be encountered by a user, but this will break a LOT of stuff if it happens to occur, so this is mainly for debugging.
        currentNestLevels.push({nestLevel: "base_nest", contents: []});
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

    if(currentNestLevels[currentNestLevels.length - 1].nestLevel == "#") {
        return;
        // Text token is a comment. Handled before the error cases to prevent errors caused by comments.
    }

    // -- INIT --
    const context: LessonParseTokenContext = {
        // These elements should NOT be edited beyond initialization
        tokenArgs: [], // textTokens do not require this
        rootNest: currentNestLevels.length > 1 ? currentNestLevels[1] : currentNestLevels[0], // Used to distinguish between <default> and <step> (index 0 is base_nest)
        lineNum: currentLineNum,
        stepRef: parseResult.steps.length > 0 ? parseResult.steps[parseResult.steps.length - 1].stepRef : "", //Obtain stepRef from parseResult

        // These elements will be edited
        docText: "", // Used to store a tag's specific documentation info, which will be used in most debug messages unless another page is more important
        docLink: "",
        thisNest: currentNestLevels[currentNestLevels.length - 1],
    };
    const totalSteps = parseResult.steps.length;
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
    
    if(currentNestLevels.length == 1) {
        // Text token is on base_nest, meaning it is not in any sections
        parseResult.ERRORS.push(newDebugMessage("FATAL - Unsectioned text segment: '" + (token.length > 32 ? (token.slice(0, 32) + "...") : token) + "' To add comments safely, please use the comment tags <#> </#>.", context, 0)); //TBC DOCUMENTATION: COMMENTS
        parseResult.success = false;
        return;
    }

    // Valid text tokens are stored between a single opening and closing tag. This means that the behaviour of this function can be sorted by the current nest level.
    // Similar to evaluateTagToken(), they are implemented in alphabetical order.
    // Same briefing about requirements and debug messages from evaluateTagToken() applies here too.


    // -- CONFIG --
    // Some constants that affect multiple parts of the parser, in case they need to be tweaked
    //const MAX_TEXT_LENGTH = 250; <- varies with pop-up type
    const MAX_TITLE_LENGTH = 100; // Maximum amount of characters for the Lesson title.

    // -- TEXT TOKEN HANDLING --

    // nest level "#" (comments) is handled in Silent Return cases

    ////////////////////////\\\\\\\\\\\\\\\\\\\\\\\\
    if(context.thisNest.nestLevel == "text") { 
        context.docText = "Step Text";
        context.docLink = "TBC DOCUMENTATION";

        if(context.rootNest.nestLevel == "default") {
            // Update the default step
            defaultStepTemplate.textContent = token;
        }
        else if (context.rootNest.nestLevel == "step") {
            if(parseResult.steps[totalSteps - 1].textContent != "PLACEHOLDER     TEXT" && parseResult.steps[totalSteps - 1].textContent != defaultStepTemplate.textContent) {
                parseResult.warnings.push(newDebugMessage("Multiple <text> sections detected. Only one section is needed to store all displayed text. This Step's text will be updated to the last read <text> section.", context, 0));
            }
            // Update the current step
            parseResult.steps[totalSteps - 1].textContent = token;
        }
        // If it is neither, there is no need to state an error message as there will already be one from evaluateTagToken()
        context.thisNest.contents.push("valid_token"); // Indicator that there is a valid text token within this nest
        return;
    }

    ////////////////////////\\\\\\\\\\\\\\\\\\\\\\\\
    if(context.thisNest.nestLevel == "title") { 
        context.docText = "Lesson Title";
        context.docLink = "TBC DOCUMENTATION";

        // [u] Title isn't too long
        if(token.length > MAX_TITLE_LENGTH) {
            parseResult.warnings.push(newDebugMessage("Lesson Title shortened due to exceeding the character limit of " + MAX_TITLE_LENGTH + ".", context, 0, "", ""));
        }

        parseResult.details.title = token.slice(0, MAX_TITLE_LENGTH); //.slice to enforce character limit
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

// Main token reader for tags, making changes to nestLevel and parseResult as required. This is the main handler for the language's syntax.
export function evaluateTagToken(token: string, currentNestLevels: LessonParseNestSection[], currentLineNum: number, parseResult: LessonParseResult, defaultStepTemplate: LessonStepAttributes) : void {
    // -- SPECIAL FAILSAFE -- 
    if(currentNestLevels.length == 0) { // "base_nest" has somehow been popped
        // This should never be encountered by a user, but this will break a LOT of stuff if it happens to occur, so this is mainly for debugging.
        currentNestLevels.push({nestLevel: "base_nest", contents: []});
        console.error("Lesson Error: 'base_nest' was somehow popped. There is a major fault with the parser.");
    }
    
    // -- INIT --
    // Interface below stores all relevant info in a single object so that it can be passed to helper functions in a much neater fashion
    const context: LessonParseTokenContext = {
        // These elements should NOT be edited beyond initialization
        tokenArgs: token.slice(1, -1).split(" "), // Removes the < and >, and then splits by space
        rootNest: currentNestLevels.length > 1 ? currentNestLevels[1] : currentNestLevels[0], // Used to distinguish between <default> and <step> (index 0 is base_nest)
        lineNum: currentLineNum,
        stepRef: parseResult.steps.length > 0 ? parseResult.steps[parseResult.steps.length - 1].stepRef : "", //Obtain stepRef from parseResult

        // These elements will be edited
        docText: "", // Used to store a tag's specific documentation info, which will be used in most debug messages unless another page is more important
        docLink: "",
        thisNest: currentNestLevels[currentNestLevels.length - 1],
    };
    const totalSteps = parseResult.steps.length;
    const stepAllSubsections = ["text", "attributes", "requirements", "hints", "req"]; // List of all potentially missing closing tags (not just basic step subsections)
    const metadataAllSubsections = ["title", "description", "project-name"];

    // -- INSTANT ERROR CASES --

    if(token == "<>" || token.replace(/\s/g, "") == "<>") { // .replace(/\s/g, "") <- whitespace remover
        parseResult.warnings.push(newDebugMessage("Ignoring empty tag: " + token + ".", context, 0, "", ""));
        return;
    }

    // As there are a lot of tags with various functionalities, they are handled in alphabetical order below (with respective exit tags </> right after)

    // To check the expected functionality of any tag, refer to the documentation.
    // Requirements with comments marked [u] are unique to that tags' context. 
    // Requirements will only return early if the tag should be ignored, or parsing should cease due to a 'FATAL' error.

    // Use case for Debug Messages:
    // - Suggestions: messages to inform the user of better coding practice. The mentioned changes will have no effect beyond better code readability.
    // - Warnings: messages to inform the programmer that they have made some slight mistake, and the parser has made placeholder changes to solve it.
    // - Errors: the programmer has made a severe mistake that needs to be solved before running the lesson. The parser will continue beyond it.
    // - FATAL Errors: the programmer has made a severe mistake that has crashed the parser. It will need to be solved to allow the parser can scan further.
    // The programmer will not be able to run the lesson if there are any errors. They can, however, run it with many warnings.

    // -- CONFIG --
    // Some constants that affect multiple parts of the parser, in case they need to be tweaked.
    const CONTINUE_FROM_MISSING_CLOSER = true; // Whether the parser should ignore missing closing tags and work around them. Risky as it is not always picked up.
    const CONTINUE_FROM_INVALID_LOCATIONS_FOR_TEXT_SECTIONS = false; // Whether the parser should increase the nest level for a tag such as <text> when it is positioned incorrectly.
    // ^^^ This setting has pros and cons - false: crashes early, less false errors / true: continues through problem for more debugging, more false errors.
    const ALLOW_MULTIPLE_STEP_SUBSECTIONS = true; // Whether Steps can have duplicate subsections (excluding <text>). An example is a Step with two <attributes> sections. Should be harmless on 'true'.
    const ALLOW_MULTIPLE_METADATA_SECTIONS = false; // Whether a Lesson File can contain more than one <metadata> section. Best practice is only one section at the top, so good to enforce.
    const ALLOW_ATTRIBUTES_IN_STEP_NEST = true; // Whether Attribute tags can be placed inside Steps without needing an <attributes> section. Putting 'false' enforces code better code organisation.
    const ALLOW_METADATA_IN_BASE_NEST = true; // Whether Metadata sections can be placed unnested (in base_nest). Putting 'false' enforces better code organisation.
    const MAX_LESSON_STEPS = 40; // Current graphics start to break at 42+ steps, so this is a good number to settle on.
    const MAX_STEPREF_LENGTH = 30;

    // -- TAG HANDLING --
    console.log("Detected tag token: " + token + " at nest level " + context.thisNest.nestLevel); //debug

    ////////////////////////\\\\\\\\\\\\\\\\\\\\\\\\
    // Comments
    if(context.tokenArgs[0] == "#") { 
        context.docText = "Comments";
        context.docLink = "TBC DOCUMENTATION";

        // Nest Level Requirement: any nest can take comments

        // Arguments Requirment: no args
        tagToken_noArgsGeneric(context, parseResult);

        // Do nothing beyond adding the nest layer. This is a comment.
        currentNestLevels.push({nestLevel: "#", contents: []}); 
        return;
    }

    ////////////////////////\\\\\\\\\\\\\\\\\\\\\\\\
    if(context.tokenArgs[0] == "/#") { 
        context.docText = "Comments";
        context.docLink = "TBC DOCUMENTATION";

        // Basic nest level and args requirements for closing tags
        if(tagToken_closeTagGeneric(context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        currentNestLevels.pop();
        return;
    }

    ////////////////////////\\\\\\\\\\\\\\\\\\\\\\\\
    // Attributes subsection for specifying data about a specific step / default
    if(context.tokenArgs[0] == "attributes") { 
        context.docText = "Step Attributes";
        context.docLink = "TBC DOCUMENTATION";
        
        // Step subsection default requirements (Flags: default, forced false due to being not text-based, default)
        if(tagToken_stepSubsections(CONTINUE_FROM_MISSING_CLOSER, false, ALLOW_MULTIPLE_STEP_SUBSECTIONS, stepAllSubsections, currentNestLevels, context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        context.thisNest.contents.push("attributes"); // Add attributes to the parent nest step/default
        currentNestLevels.push({nestLevel: "attributes", contents: []});
        return;
    }

    ////////////////////////\\\\\\\\\\\\\\\\\\\\\\\\
    if(context.tokenArgs[0] == "/attributes") { 
        context.docText = "Step Attributes";
        context.docLink = "TBC DOCUMENTATION";

        // Basic nest level and args requirements for closing tags
        if(tagToken_closeTagGeneric(context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        /* This case seems more annoying than useful - most programmers will likely copy and paste a step template with an attributes section, even for steps with no changes from default.
        // [u] Empty attributes section
        if(context.thisNest.contents.length == 0) {
            parseResult.warnings.push(newDebugMessage("Step Attributes section has no content.", context, 0));
        }*/

        currentNestLevels.pop(); // Remove nestLevel
        return;
    }

    ////////////////////////\\\\\\\\\\\\\\\\\\\\\\\\
    // Description of the Lesson File, displayed at the beginning when starting the Lesson. Stored in metadata
    if(context.tokenArgs[0] == "description") {
        context.docText = "Lesson Description";
        context.docLink = "TBC DOCUMENTATION";

        // Closer check for metadata sections
        if(tagToken_subsectionMissingCloserCheck(CONTINUE_FROM_MISSING_CLOSER, metadataAllSubsections, currentNestLevels, context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // Nest Level Requirement: metadata (or base_nest if allowed by ALLOW_METADATA_IN_BASE_NEST)
        if(context.thisNest.nestLevel == "base_nest" && ALLOW_METADATA_IN_BASE_NEST) {
            parseResult.suggestions.push(newDebugMessage("Consider placing " + token + " subsection within the Lesson's <metadata> section for better organisation.", context, 0));
        } 
        else if(context.thisNest.nestLevel != "metadata") {
            // Potential mistake between distinguishing <title> and <text>
            if(context.thisNest.nestLevel == "step" || context.thisNest.nestLevel == "default") {
                parseResult.suggestions.push(newDebugMessage("Lesson Description tag detected within <" + context.thisNest.nestLevel + "> section. Did you mean <text>?", context, 0)); //TBC DOCUMENTATION: TEXT
            }

            if(CONTINUE_FROM_INVALID_LOCATIONS_FOR_TEXT_SECTIONS) {
                parseResult.warnings.push(newDebugMessage("Invalid positioning for Title tag: " + token + ". The Lesson's Title should be specified within the <metadata> section. This section will be ignored.", context, 0));
            }
            else {
                parseResult.warnings.push(newDebugMessage("Invalid positioning for Title tag: " + token + ". The Lesson's Title should be specified within the <metadata> section. This tag will be ignored.", context, 0));
                return;
            }
        }

        // Arguments Requirment: no args with special informative message
        tagToken_noArgsGeneric(context, parseResult, "Unnecessary arguments found within tag: <" + context.tokenArgs.join(" ") + ">. The Lesson Title is specified as a text section, not within tag arguments. These arguments will be ignored.");
    
        // [u] Check for whether title has already been modified (can't use normal nest.contents method due to potentially multiple metadata sections + non-nested titles)
        if(parseResult.details.title != "PLACEHOLDER     TEXT") {
            parseResult.ERRORS.push(newDebugMessage("FATAL - Multiple Title sections detected. Please ensure the Lesson File only contains one <title> tag.", context, 0));
            parseResult.success = false;
            return;
        }

        context.thisNest.contents.push("title"); // Add attributes to the parent nest
        currentNestLevels.push({nestLevel: "title", contents: []}); // Only needs to add nest level, evaluateTextToken() handles the rest
        return;
    }

    ////////////////////////\\\\\\\\\\\\\\\\\\\\\\\\
    if(context.tokenArgs[0] == "/title") { 
        context.docText = "Lesson Title";
        context.docLink = "TBC DOCUMENTATION";

        // Basic nest level and args requirements for closing tags
        if(tagToken_closeTagGeneric(context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // [u] Check that a valid text token was detected in this nest
        if(context.thisNest.contents.length == 0) { // Will contain "valid_node" if text was detected
            parseResult.warnings.push(newDebugMessage("Empty " + token + " section detected. Ensure that text-based sections contain at least one non-whitespace character. This section has been ignored.", context, 0)); //TBC DOCUMENTATION: SECTIONS
            currentNestLevels[currentNestLevels.length - 2].contents.pop(); // Deletes the respective element from contents of parent node, 'ignoring' the section.
        }

        currentNestLevels.pop(); // Remove nestLevel
        return;
    }


    ////////////////////////\\\\\\\\\\\\\\\\\\\\\\\\
    // Lesson metadata section for details about the Lesson, such as its title and description
    if(context.tokenArgs[0] == "metadata") { 
        context.docText = "Lesson Metadata";
        context.docLink = "TBC DOCUMENTATION";
    
        // Nest Level Requirement: base (no nesting)
        if(context.thisNest.nestLevel != "base_nest") {
            parseResult.warnings.push(newDebugMessage("Invalid positioning for Metadata tag: " + token + ". The Metadata section should not be nested in other sections. This tag will be ignored.", context, 0));
            return;
        }

        // Arguments Requirment: no args
        tagToken_noArgsGeneric(context, parseResult);

        // Uniqueness Requirement: one per file (recommended but not enforced)
        if(context.thisNest.contents.includes("metadata")) {
            if(ALLOW_MULTIPLE_METADATA_SECTIONS) {
                parseResult.suggestions.push(newDebugMessage("Multiple <metadata> sections detected. It is recommended to have a single Metadata section kept at the top of the Lesson File.", context, 0));
            }
            else {
                parseResult.ERRORS.push(newDebugMessage("FATAL - Multiple <metadata> sections detected. Ensure that you have a single Metadata section kept at the top of the Lesson File.", context, 0));
                parseResult.success = false;
                return;
            }
        }

        // [u] Positioning within the file, checked via the contents of base_nest. Recommended to be at the top of the file before any steps or defaults.
        if(context.thisNest.contents.length > 0) {
            parseResult.suggestions.push(newDebugMessage("Consider moving the <metadata> section to the top of the Lesson File for better organisation.", context, 0));
        }

        context.thisNest.contents.push("metadata");
        currentNestLevels.push({nestLevel: "metadata", contents: []});
        return;
    }

    ////////////////////////\\\\\\\\\\\\\\\\\\\\\\\\
    if(context.tokenArgs[0] == "/metadata") { 
        context.docText = "Lesson Metadata";
        context.docLink = "TBC DOCUMENTATION";

        // Basic nest level and args requirements for closing tags
        if(tagToken_closeTagGeneric(context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // [u] Empty metadata section
        if(context.thisNest.contents.length == 0) {
            parseResult.warnings.push(newDebugMessage("Empty Metadata section detected. Refer to the documentation for a list of valid tags to be used within this section. This section will be ignored and Lesson File will maintain default information.", context, 0));
            
            // Remove this Metadata record from base_nest contents (will be most recent entry assuming valid opening tag)
            // Prevents a niche error case where user has an empty <metadata> section, and then a valid one right after. Ignoring this section will allow the parser to read the next one as valid.
            currentNestLevels[0].contents.pop();
        }

        currentNestLevels.pop(); // Remove nestLevel
        return;
    }

    ////////////////////////\\\\\\\\\\\\\\\\\\\\\\\\
    // Attribute to determine the panel type of a step (where the panel is displayed in the editor)
    if(context.tokenArgs[0] == "panel-type") { 
        context.docText = "Step Panel Type";
        context.docLink = "TBC DOCUMENTATION";

        // Basic nest level, args and uniqueness requirements for attributes
        if(tagToken_stepAttributeUniqueFixedArguments(1, ALLOW_ATTRIBUTES_IN_STEP_NEST, context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        //Mapping of each parameter input to its ENUM type
        const panelArgMap: Record<string, StepPanelType> = {
            "popup-left": StepPanelType.LEFT_POPUP,
            "popup-right": StepPanelType.RIGHT_POPUP,
            "bar": StepPanelType.BOTTOM_WIDTH,
            "focus-modal": StepPanelType.FULLSCREEN_FOCUS_MODAL,
        };

        // [u] Unknown argument which does not match any of the keywords above
        if(!panelArgMap[context.tokenArgs[1]]) {
            parseResult.warnings.push(newDebugMessage("Unknown Panel Type argument: " + token + ". This tag will be ignored and the Step will keep its default Panel Type.", context, 0));
            return;
        }

        // Successful tag if this point is reached
        if(context.rootNest.nestLevel == "default" || (context.thisNest.nestLevel == "default" && ALLOW_ATTRIBUTES_IN_STEP_NEST)) {
            defaultStepTemplate.panelType = panelArgMap[context.tokenArgs[1]];
        }
        else if(context.rootNest.nestLevel == "step" || (context.thisNest.nestLevel == "step" && ALLOW_ATTRIBUTES_IN_STEP_NEST)) { // Should be guaranteed to be step
            parseResult.steps[totalSteps - 1].panelType = panelArgMap[context.tokenArgs[1]];
        }

        context.thisNest.contents.push("panel-type"); // Add attribute to parent nest contents
        return;
    }

    ////////////////////////\\\\\\\\\\\\\\\\\\\\\\\\
    // Main enclosing section for a single step, taking a stepRef as an argument and containing all step subsections
    if(context.tokenArgs[0] == "step") { 
        context.docText = "Steps";
        context.docLink = "TBC DOCUMENTATION";

        // [u] Nest level is step already - likely forgotten closing tag from previous step
        if(context.thisNest.nestLevel == "step") {
            if(CONTINUE_FROM_MISSING_CLOSER) {
                parseResult.ERRORS.push(newDebugMessage("Likely missing Step closing tag </step>. All section-based tags must have a closer.", context, -1)); //TBC DOCUMENTATION: SECTIONS
                
                // Attempts to resolve the issue by removing the step nestLevel and continuing. Only continues to scan for more errors for convenience.
                currentNestLevels.pop();
                context.thisNest = currentNestLevels[currentNestLevels.length - 1];
            }
            else {
                parseResult.ERRORS.push(newDebugMessage("FATAL: Likely missing Step closing tag </step>. All section-based tags must have a closer.", context, -1)); //TBC DOCUMENTATION: SECTIONS
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
        if(totalSteps == MAX_LESSON_STEPS) {
            parseResult.ERRORS.push(newDebugMessage("FATAL - Maximum Steps reached. Lesson files are limited to " + MAX_LESSON_STEPS + " total Steps. Please consider shortening this lesson or combining smaller Steps together.", context, 0)); //TBC DOCUMENTATION: GENERAL LESSON RULES?
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
        if(newStepRef.length > MAX_STEPREF_LENGTH) {
            newStepRef = newStepRef.slice(0, MAX_STEPREF_LENGTH);
            parseResult.warnings.push(newDebugMessage("Step name shortened due to exceeding the character limit of " + MAX_STEPREF_LENGTH + ".", context, 0, "", ""));
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
        const newStep = structuredClone(defaultStepTemplate); // Uses structuredClone to ensure new copies of object array attributes are created, for example the requirements list.
        newStep.stepRef = newStepRef; // Assign the new stepRef
        parseResult.steps.push(newStep);

        currentNestLevels.push({nestLevel: "step", contents: []}); // Add nest level
        return;
    }

    ////////////////////////\\\\\\\\\\\\\\\\\\\\\\\\
    if(context.tokenArgs[0] == "/step") { 
        context.docText = "Steps";
        context.docLink = "TBC DOCUMENTATION";

        // Basic nest level and args requirements for closing tags
        if(tagToken_closeTagGeneric(context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // [u] steps should have custom text as a minimum
        if(parseResult.steps[totalSteps - 1].textContent == "PLACEHOLDER     TEXT" || parseResult.steps[totalSteps - 1].textContent == "") {
            parseResult.ERRORS.push(newDebugMessage("Step is missing valid text content. Ensure either the step has a non-empty <text> section, or that one is specified in <default>.", context, 0)); //TBC DOCUMENTATION: TEXT
        }

        currentNestLevels.pop(); // Remove nestLevel
        context.stepRef = ""; // Empties stepRef as the parser is no longer in a step - helps for debugging
        return; 
    }

    ////////////////////////\\\\\\\\\\\\\\\\\\\\\\\\
    // Text subsection which contains the displayed text of a step
    if(context.tokenArgs[0] == "text") {
        context.docText = "Step Text";
        context.docLink = "TBC DOCUMENTATION";

        // Step subsection default requirements (Flags: default, default, default)
        if(tagToken_stepSubsections(CONTINUE_FROM_MISSING_CLOSER, CONTINUE_FROM_INVALID_LOCATIONS_FOR_TEXT_SECTIONS, ALLOW_MULTIPLE_STEP_SUBSECTIONS, stepAllSubsections, currentNestLevels, context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        context.thisNest.contents.push("text"); // Add attributes to the parent nest
        currentNestLevels.push({nestLevel: "text", contents: []}); // Only needs to add nest level, evaluateTextToken() handles the rest
        return;
    }

    ////////////////////////\\\\\\\\\\\\\\\\\\\\\\\\
    if(context.tokenArgs[0] == "/text") { 
        context.docText = "Step Text";
        context.docLink = "TBC DOCUMENTATION";

        // Basic nest level and args requirements for closing tags
        if(tagToken_closeTagGeneric(context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // [u] Check that a valid text token was detected in this nest
        if(context.thisNest.contents.length == 0) { // Will contain "valid_node" if text was detected
            parseResult.warnings.push(newDebugMessage("Empty " + token + " section detected. Ensure that text-based sections contain at least one non-whitespace character. This section has been ignored.", context, 0)); //TBC DOCUMENTATION: SECTIONS
            currentNestLevels[currentNestLevels.length - 2].contents.pop(); // Deletes the respective element from contents of parent node, 'ignoring' the section.
        }

        currentNestLevels.pop(); // Remove nestLevel
        return;
    }

    ////////////////////////\\\\\\\\\\\\\\\\\\\\\\\\
    // Title of the Lesson File (not the project name). Stored in metadata
    if(context.tokenArgs[0] == "title") {
        context.docText = "Lesson Title";
        context.docLink = "TBC DOCUMENTATION";

        // Closer check for metadata sections
        if(tagToken_subsectionMissingCloserCheck(CONTINUE_FROM_MISSING_CLOSER, metadataAllSubsections, currentNestLevels, context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // Nest Level Requirement: metadata (or base_nest if allowed by ALLOW_METADATA_IN_BASE_NEST)
        if(context.thisNest.nestLevel == "base_nest" && ALLOW_METADATA_IN_BASE_NEST) {
            parseResult.suggestions.push(newDebugMessage("Consider placing " + token + " subsection within the Lesson's <metadata> section for better organisation.", context, 0));
        } 
        else if(context.thisNest.nestLevel != "metadata") {
            // Potential mistake between distinguishing <title> and <text>
            if(context.thisNest.nestLevel == "step" || context.thisNest.nestLevel == "default") {
                parseResult.suggestions.push(newDebugMessage("Lesson Title tag detected within <" + context.thisNest.nestLevel + "> section. Did you mean <text>?", context, 0)); //TBC DOCUMENTATION: TEXT
            }

            if(CONTINUE_FROM_INVALID_LOCATIONS_FOR_TEXT_SECTIONS) {
                parseResult.warnings.push(newDebugMessage("Invalid positioning for Title tag: " + token + ". The Lesson's Title should be specified within the <metadata> section. This section will be ignored.", context, 0));
            }
            else {
                parseResult.warnings.push(newDebugMessage("Invalid positioning for Title tag: " + token + ". The Lesson's Title should be specified within the <metadata> section. This tag will be ignored.", context, 0));
                return;
            }
        }

        // Arguments Requirment: no args with special informative message
        tagToken_noArgsGeneric(context, parseResult, "Unnecessary arguments found within tag: <" + context.tokenArgs.join(" ") + ">. The Lesson Title is specified as a text section, not within tag arguments. These arguments will be ignored.");
    
        // [u] Check for whether title has already been modified (can't use normal nest.contents method due to potentially multiple metadata sections + non-nested titles)
        if(parseResult.details.title != "PLACEHOLDER     TEXT") {
            parseResult.ERRORS.push(newDebugMessage("FATAL - Multiple Title sections detected. Please ensure the Lesson File only contains one <title> tag.", context, 0));
            parseResult.success = false;
            return;
        }

        context.thisNest.contents.push("title"); // Add attributes to the parent nest
        currentNestLevels.push({nestLevel: "title", contents: []}); // Only needs to add nest level, evaluateTextToken() handles the rest
        return;
    }

    ////////////////////////\\\\\\\\\\\\\\\\\\\\\\\\
    if(context.tokenArgs[0] == "/title") { 
        context.docText = "Lesson Title";
        context.docLink = "TBC DOCUMENTATION";

        // Basic nest level and args requirements for closing tags
        if(tagToken_closeTagGeneric(context, parseResult)) {
            return; // ^ If true, tag needs to be ignored
        }

        // [u] Check that a valid text token was detected in this nest
        if(context.thisNest.contents.length == 0) { // Will contain "valid_node" if text was detected
            parseResult.warnings.push(newDebugMessage("Empty " + token + " section detected. Ensure that text-based sections contain at least one non-whitespace character. This section has been ignored.", context, 0)); //TBC DOCUMENTATION: SECTIONS
            currentNestLevels[currentNestLevels.length - 2].contents.pop(); // Deletes the respective element from contents of parent node, 'ignoring' the section.
        }

        currentNestLevels.pop(); // Remove nestLevel
        return;
    }

    ////////////////////////\\\\\\\\\\\\\\\\\\\\\\\\
    // If this point is reached, then the tag has not been matched to any valid input. 
    // (if this message is shown for a valid tag, then that tag's if-condition is missing a return; at the end of its blcok)
    parseResult.warnings.push(newDebugMessage("Unknown tag: " + token + ". Check for typos and refer to the documentation for all of valid tags. This tag will be ignored.", context, 0, "", ""));
}

// The next few functions are some repeat cases for debug messages, called by evaluateTagToken().
// These functions should only create debug messages and some return true if early termination is needed. ANY LOGIC BEYOND THIS SHOULD BE KEPT WITHIN evaluateTagToken().

// Baseline 'no args' requirement.
// No return needed as arguments are simply ignored
function tagToken_noArgsGeneric(context: LessonParseTokenContext, parseResult: LessonParseResult, overrideMessage?: string) {
    if(context.tokenArgs.length > 1) {
        parseResult.warnings.push(newDebugMessage(overrideMessage ?? "Unnecessary arguments found within tag: <" + context.tokenArgs.join(" ") + ">. Excess arguments will be ignored.", context, 0));
    }
}

// Covers the two main default requirements for (almost?) all closing tags:
// - No arguments
// - Valid opening tag (checked by nest level)
// Returns 'true' when evaluateTagToken() needs to return early (ignore the tag).
function tagToken_closeTagGeneric(context: LessonParseTokenContext, parseResult: LessonParseResult) : boolean {

    // Nest Level Requirement: same as the token name without the / (e.g. /text requires text)
    if(context.thisNest.nestLevel != context.tokenArgs[0].slice(1)) { //slice(1) removes the /
        parseResult.warnings.push(newDebugMessage("Invalid positioning for closing tag: <" + context.tokenArgs.join(" ") + ">. No valid paired opening tag is detected. This tag will be ignored.", context, 0)); //TBC DOCUMENTATION
        return true;
    }

    // Arguments Requirment: no args
    tagToken_noArgsGeneric(context, parseResult);

    return false;
}

// Covers the base requirements subsections for steps/defaults, making use of a list of all possible subsections.
// - Checks for potentially missing closing tags from other step subsections
// - Nest level is step or default
// - No arguments
// - Uniqueness (depends on settings context)
function tagToken_stepSubsections(contWithMissingCloser: boolean, contWithInvalidTextNest: boolean, allowDuplicates: boolean, stepSubsections: string[], currentNestLevels: LessonParseNestSection[], context: LessonParseTokenContext, parseResult: LessonParseResult) : boolean {
    // [u] Check for missing closing tags of other step-specific subsections
    if(tagToken_subsectionMissingCloserCheck(contWithMissingCloser, stepSubsections, currentNestLevels, context, parseResult)) {
        return true;
    }
    
    // Nest Level Requirement: step or default
    if(context.thisNest.nestLevel != "step" && context.thisNest.nestLevel != "default") {
        if(contWithInvalidTextNest) { // This can only be true for text-based step subsections, and is dependant on the CONTINUE_FROM_INVALID_LOCATIONS_FOR_TEXT_SECTIONS setting
            parseResult.warnings.push(newDebugMessage("Invalid positioning for Step subsection tag: <" + context.tokenArgs.join(" ") + ">. Step sections should only be contained within the <default> section or individual Steps. This section will be ignored.", context, 0));
        }
        else {
            parseResult.warnings.push(newDebugMessage("Invalid positioning for Step subsection tag: <" + context.tokenArgs.join(" ") + ">. Step subsections should only be contained within the <default> section or individual Steps. This tag will be ignored.", context, 0));
            return true;
        }
    }

    // Arguments Requirment: no args
    tagToken_noArgsGeneric(context, parseResult);
    
    // Uniqueness Requirement: one per parent section
    if(context.thisNest.contents.includes(context.tokenArgs[0])) {
        if(allowDuplicates) {
            parseResult.suggestions.push(newDebugMessage("Multiple <" + context.tokenArgs[0] + "> subsections in one step. It is advised to only have at most one of each subsection per Step. Consider merging these two sections into one.", context, 0)); //TBC DOCUMENTATION: SECTIONS
        }
        else {
            parseResult.ERRORS.push(newDebugMessage("FATAL - Multiple <" + context.tokenArgs[0] + "> sections within one Step. Please merge duplicate subsections into one per step.", context, 0)); //TBC DOCUMENTATION: SECTIONS
            parseResult.success = false;
            return true;
        }
    }

    return false;
}

// Checks for potentially missing closer tags within the <metadata> section
// Unlike step subsections, each tag has a unique set of debug messages and therefore the rest of the requirements can't be handled here.
function tagToken_subsectionMissingCloserCheck(contWithMissingCloser: boolean, potentialSubsections: string[], currentNestLevels: LessonParseNestSection[], context: LessonParseTokenContext, parseResult: LessonParseResult) : boolean {
    // [u] Check for missing closing tags of other subsections
    if(potentialSubsections.includes(context.thisNest.nestLevel) && context.thisNest.nestLevel != context.tokenArgs[0]) {
        if(contWithMissingCloser) {
            parseResult.ERRORS.push(newDebugMessage("Likely missing closing tag </" + context.thisNest.nestLevel + ">. All section-based tags must have a closer.", context, 0)); //TBC DOCUMENTATION: SECTIONS
            
            // Attempts to resolve the issue by removing the step nestLevel and continuing. Only continues to scan for more errors for convenience.
            currentNestLevels.pop();
            context.thisNest = currentNestLevels[currentNestLevels.length - 1];
        }
        else {
            parseResult.ERRORS.push(newDebugMessage("FATAL: Likely missing closing tag </" + context.thisNest.nestLevel + ">. All section-based tags must have a closer.", context, 0)); //TBC DOCUMENTATION: SECTIONS
            parseResult.success = false;
            return true;
        }
    }

    return false;
}

// Covers the base requirements for unique step attributes:
// - Inside <attributes> (unless setting allows otherwise).
// - Argument count equal to specified expected value.
// - Only one of this attribute specification within the current step.
// Returns 'true' when evaluateTagToken() needs to return early (ignore the tag).
function tagToken_stepAttributeUniqueFixedArguments(expectedArgs: number, allowStepNest: boolean, context: LessonParseTokenContext, parseResult: LessonParseResult) : boolean {
    
    // Nest Level Requirement: attributes, or just default/step if ALLOW_ATTRIBUTES_IN_STEP_NEST == true.
    if(context.thisNest.nestLevel != "attributes") {
        if(allowStepNest && (context.thisNest.nestLevel == "default" || context.thisNest.nestLevel == "step")) {
            parseResult.suggestions.push(newDebugMessage("Unnested Attribute tag: <" + context.tokenArgs.join(" ") + ">. For better code readability, consider grouping all Attribute tags within the <attributes> section.", context, 0, "", ""));
        }
        else {
            parseResult.warnings.push(newDebugMessage("Invalid positioning for Attribute tag: <" + context.tokenArgs.join(" ") + ">. Attributes should be stored within a Step's <attributes> section. This tag will be ignored.", context, 0, "", ""));
            return true;
        }
    }

    // Arguments Requirment: dependant on expectedArgs, usually being 0 or 1. Do not use this method for flexible argument counts.
    if(context.tokenArgs.length - 1 > expectedArgs) {
        parseResult.warnings.push(newDebugMessage("Unnecessary arguments found within Attribute tag: <" + context.tokenArgs.join(" ") + ">. Expected " + expectedArgs + ", Found " + (context.tokenArgs.length - 1) + ". Excess arguments will be ignored.", context, 0));
    }
    if(context.tokenArgs.length - 1 < expectedArgs) {
        parseResult.warnings.push(newDebugMessage("Missing arguments for Attribute tag: <" + context.tokenArgs.join(" ") + ">.  Expected " + expectedArgs + ", Found " + (context.tokenArgs.length - 1) + ". This tag will be ignored.", context, 0));
        return true;
    }

    // Uniqueness Requirement: one per parent section
    if(context.thisNest.contents.includes(context.tokenArgs[0])) {
        parseResult.warnings.push(newDebugMessage("Multiple instances of Attribute tag within one step: <" + context.tokenArgs[0] + ">. Only the first valid instance of an Attribute tag will be used. This tag will be ignored.", context, 0)); //TBC DOCUMENTATION: ATTRIBUTES
        return true;
    }

    return false;
}