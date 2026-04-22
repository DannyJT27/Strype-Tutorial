// Helper functions for handling Requirements during lessons

import { parseCodeAndGetParseElements } from "@/parser/parser";
import { useStore } from "@/store/store";
import { LessonRequirement, LessonStepDetails, ParserElements, StepRequirementType } from "@/types/types";

let parserElements = null as ParserElements | null;
let codebaseContentAtNewStep = ""; // Used for <changes-made> requirement
let lastParseTime = 0;
const PYTHON_PARSE_COOLDOWN = 3000; // Millisecond cooldown between requesting parses

// Requesting a parsed string of the entire python codebase is an intensive task that multiple
// requirement types rely on. By having it in a seperate function that runs on a cooldown,
// it prevents longer stalling caused by a Step having multiple different Requirements that use it.
function updateParsedCodeStore() {
    if(lastParseTime + PYTHON_PARSE_COOLDOWN < Date.now()) {
        lastParseTime = Date.now();
        parserElements = parseCodeAndGetParseElements(false, "py-export"); // uses py-export to match user-written python code.
    }
}

// Returns the list of incomplete requirements. If length == 0, all requirements are fulfilled.
export function getIncompleteRequirements(reqList: LessonRequirement[]): LessonRequirement[] {
    return reqList.filter((req) => !checkRequirement(req));
}

// ! PROCESS FOR ADDING A NEW REQUIREMENT TYPE !
// - Value to be added to the enum StepRequirementType in 'types.ts'
// - Respective content for all functions in this method below where needed.
// - New tag added to the parser, with the logic needed for storing the information in the Step Details.
// - Any other logic for checking the requirement's status across other files, such as variables in the store.

// Handles the reseting of all requirement based values when starting a new lesson or reaching a new step
export function resetRequirementValues(): void {
    useStore().lessonResetNextStepFailedAttempts(); // Reset attempts counter for next step
    useStore().lessonSetTimeNewStepOpenedToNow(); // Marks the time that the next step was opened
    useStore().setHasRanCode(false);
    if(stepHasRequirement(useStore().getCurrentStepAttributes, StepRequirementType.CHANGES_MADE)) {
        // For <changes-made> requirement, it stores the state of the code upon entering the Step. This is compared to the codebase to check for changes.
        // A better approach would use the 'undo' buffer, checking for additions or subtractions since entering the step, 
        // but I was not able to get it consistently working due to lacking knowledge of the undo/redo system functionality.
        updateParsedCodeStore();
        if(parserElements) {
            codebaseContentAtNewStep = parserElements.parsedOutput;
        }
    }
}

// Computes the status of a Requirement, returning true if the requirement is fulfilled.
function checkRequirement(req: LessonRequirement): boolean {
    let status = true;

    switch (req.reqType) {
    case (StepRequirementType.CHANGES_MADE):
        updateParsedCodeStore();
        if(parserElements) {
            status = codebaseContentAtNewStep != parserElements.parsedOutput;
        }
        break;
    
    case (StepRequirementType.CONSOLE_OUTPUT): { // {} allows const definition
        // IMPORTANT: must be kept consistent with getPEAConsoleId()
        const pythonConsole = document.getElementById("peaConsole") as HTMLTextAreaElement;
        if(req.textValue && pythonConsole) {
            status = pythonConsole.value.replace(/\s+/g, " ").toLowerCase().includes(req.textValue.replace(/\s+/g, " ").toLowerCase());
        }
        break;
    }
    case (StepRequirementType.FAILED_ATTEMPTS):
        status = useStore().getNextStepAttempts >= (req.numValue ?? 0);
        break;
        
    case (StepRequirementType.HAS_PYTHON):
        // The Python Content parser tends to leave whitespace artifacts in certain lines, such as "for i  in range(10)  :"
        // The .replace turns all substrings of 2 or more spaces into just 1 space. This is also applied to the compare string for consistency.
        if(req.textValue) {
            updateParsedCodeStore();
            if(parserElements) {
                status = parserElements.parsedOutput.replace(/\s+/g, " ").toLowerCase().includes(req.textValue.replace(/\s+/g, " ").toLowerCase());
            }
        }
        break;

    case (StepRequirementType.NO_ERRORS):
        updateParsedCodeStore();
        if(parserElements) {
            status = !parserElements.hasErrors;
        }
        break;
    
    case (StepRequirementType.RUN_CODE):
        status = useStore().getHasRanCode;
        break;
    
    case (StepRequirementType.TIME_PASSED):
        status = (Date.now() - useStore().getTimeNewStepOpened) >= (req.numValue ?? 0) * 1000;
        break;
    }
    // Invalid requirement types return true by default to prevent getting stuck behind an unsolvable condition
    // Cases where textValue or numValue are expected will return true when the values aren't available. 
    // However, this can only happen if there is a fault with the Lesson File Parser, and should never be encountered by the user.
    return req.negated ? !status : status;
}

// Interface to return with requirementStatusString()
export interface DebugRequirementStatusDisplay {
    detailsText: string,
    progressText: string,
    status: boolean,
}

// Used for Test Mode's Debug Panel, returning a string message for requirement types and their progress towards being fulfilled.
// Simple boolean requirements such as CHANGES_MADE and RUN_CODE do not need to show their status in the message, as the actual display will change colour when the requirement is fulfilled.
export function requirementStatusString(req: LessonRequirement, disabled: boolean): DebugRequirementStatusDisplay {
    const reqStatus = disabled ? false : checkRequirement(req); // Only check requirement if needed
    let details = "Unknown Requirement";
    let progress = (reqStatus ? "O" : "X"); // Default for requirements with a simple boolean status (no progress to display)

    switch (req.reqType) {
    case (StepRequirementType.CHANGES_MADE):
        if(req.negated) {
            details = "Expecting no changes made to the user's code since opening the Step.";
        }
        else {
            details = "Expecting a change made to the user's code since opening the Step.";
        }
        break;
    
    case (StepRequirementType.CONSOLE_OUTPUT):
        if(req.negated) {
            details = "Expecting no instances of text in console output: '" + (req.textValue ?? "") + "'.";
        }
        else {
            details = "Expecting console output: '" + (req.textValue ?? "") + "'.";
        }
        break;

    case (StepRequirementType.FAILED_ATTEMPTS):
        if(req.negated) {
            details = "Expecting less than" + (req.numValue ?? 0) + " failed attempts to go to the next Step.";
        }
        else {
            details = "Expecting " + (req.numValue ?? 0) + " failed attempts to go to the next Step.";
        }
        progress = useStore().getNextStepAttempts + "/" + (req.numValue ?? 0);
        break;

    case (StepRequirementType.HAS_PYTHON):
        if(req.negated) {
            details = "Expecting no instances of Python code: '" + (req.textValue ?? "") + "'.";
        }
        else {
            details = "Expecting present Python code: '" + (req.textValue ?? "") + "'.";
        }
        break;

    case (StepRequirementType.NO_ERRORS):
        if(req.negated) {
            details = "Expecting at least one error in the user's code.";
        }
        else {
            details = "Expecting no errors in the user's code.";
        }
        break;

    
    case (StepRequirementType.RUN_CODE):
        if(req.negated) {
            details = "Expecting the user to have not run their code yet.";
        }
        else {
            details = "Expecting the user to run their code.";
        }
        break;
    
    case (StepRequirementType.TIME_PASSED):
        if(req.negated) {
            details = "Expecting the user to spend less than " + (req.numValue ?? 0) + " seconds on this Step.";
        }
        else {
            details = "Expecting the user to spend " + (req.numValue ?? 0) + " seconds on this Step.";
        }
        progress = Math.floor(((Date.now() - useStore().getTimeNewStepOpened) / 1000)) + "/" + (req.numValue ?? 0) + "s";
        break;
    }
    // "Unknown Requirement" is a notification to developers that a newly implemented requirement type is missing a message here. The educator should not be seeing it.
    return {detailsText: details, progressText: progress, status: reqStatus};
}

// When the student has not fulfilled a requirement, this message appears to guide them (in case the teacher has not put hints). 
// Only one message will be displayed at a time, being the top unfulfilled requirement.
// hideExpectedValue is controlled by a Step Attribute, determining whether to tell the student what the requirement is looking for. Only applies to some Requirement types.
export function requirementMessage(req: LessonRequirement, hideExpectedValue: boolean): string {
    if(!req) { // If the method is called with no unfulfilled requirements, it will pass 'req' as undefined
        return "";
    }

    // Computes the status of a Requirement
    switch (req.reqType) {
    case (StepRequirementType.CHANGES_MADE):
        return "You have not made any changes to your code.";
    
    case (StepRequirementType.CONSOLE_OUTPUT):
        if(req.negated) { // This Requirement type can be negated on Steps
            if(hideExpectedValue) {
                return "Your code's is outputting incorrect results.";
            }
            else {
                return "Your code's is outputting incorrect results: '" + req.textValue + "'.";
            }
        }
        else {
            if(hideExpectedValue) {
                return "Your code's output is not as expected.";
            }
            else {
                return "Your code's output is not as expected. The code should be outputting: '" + req.textValue + "'.";
            }
        }

    case (StepRequirementType.FAILED_ATTEMPTS):
        return ""; // This Requirement Type cannot be used for Steps, only Hints. There is no use for a message here as it will never be displayed due to enforcements by the parser.
        
    case (StepRequirementType.HAS_PYTHON):
        if(req.negated) { // This Requirement type can be negated on Steps
            if(hideExpectedValue) {
                return "Your code has content that shouldn't be present.";
            }
            else {
                return "Your code has content that shouldn't be present: '" + req.textValue + "'.";
            }
        }
        else {
            if(hideExpectedValue) {
                return "Your code is missing content that should be present.";
            }
            else {
                return "Your code is missing content that should be present: '" + req.textValue + "'.";
            }
        }

    case (StepRequirementType.NO_ERRORS):
        if(req.negated) { // This Requirement type can be negated on Steps
            return "Your code should have some errors."; // unsure what this could be used for really...
        }
        else {
            return "Your code should not have any errors.";
        }
    
    case (StepRequirementType.RUN_CODE):
        return "Try running your code before continuing.";
    
    case (StepRequirementType.TIME_PASSED):
        if(hideExpectedValue) {
            return "You should spend some more time on this step.";
        }
        else {
            return "You should spend some more time on this step. You can continue in " + Math.ceil((req.numValue ?? 0) - ((Date.now() - useStore().getTimeNewStepOpened) / 1000)) + " seconds.";
        }
    }

    // This message is more of a notification to developers that a newly implemented requirement type is missing a message here. The student should not be seeing it.
    return "You have unfulfilled Requirements...";
}

// Checks for the presence of a specified Requirement Type inside a step, scanning both the Step Requirements and each Hint's requirements
export function stepHasRequirement(step: LessonStepDetails, type: StepRequirementType): boolean {
    let present = false;

    // Scan the step's requirements
    present = step.requirements.some((r) => r.reqType === type);

    // Scan each hint's requirements
    present = present || step.hints.some((h) => h.requirements.some((r) => r.reqType === type));

    return present;
}