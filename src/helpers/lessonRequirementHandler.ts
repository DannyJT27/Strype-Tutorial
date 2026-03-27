// Helper function for handling Requirements during lessons

import { useStore } from "@/store/store";
import { LessonRequirement, LessonStepDetails, StepRequirementType } from "@/types/types";

// Adding a new requirement type requires the following additions:
// - A value to be added to the enum StepRequirementType in 'types.ts'.
// - Respective content for all functions in this method.
// - A working tag to be added to the parser.
// - Any other logic needed to check the requirement's status.

// Returns the list of incomplete requirements. If length == 0, all requirements are fulfilled.
export function getIncompleteRequirements(reqList: LessonRequirement[]): LessonRequirement[] {
    return reqList.filter((req) => !checkRequirement(req));
}

// Computes the status of a Requirement, returning true if the requirement is fulfilled.
function checkRequirement(req: LessonRequirement): boolean {
    switch (req.reqType) {
    case (StepRequirementType.CHANGES_MADE):
        break;
    
    case (StepRequirementType.CONSOLE_OUTPUT):
        break;

    case (StepRequirementType.FAILED_ATTEMPTS):
        return useStore().getNextStepAttempts >= (req.numValue ?? 0);
    
    case (StepRequirementType.PYTHON_PRESENT):
        break;

    case (StepRequirementType.PYTHON_NOT_PRESENT):
        break;
    
    case (StepRequirementType.RUN_CODE):
        return useStore().getHasRanCode;
    
    case (StepRequirementType.TIME_PASSED):
        return (Date.now() - useStore().getTimeNewStepOpened) >= (req.numValue ?? 0) * 1000;
    }
    // Invalid requirement types return true by default to prevent getting stuck behind an unsolvable condition
    return true;
}

// Interface to return with requirementStatusString()
interface DebugRequirementStatusDisplay {
    detailsText: string,
    progressText: string,
    status: boolean,
}

// Used for Test Mode's Debug Panel, returning a string message for requirement types and their progress towards being fulfilled.
// Simple boolean requirements such as CHANGES_MADE and RUN_CODE do not need to show their status in the message, as the actual display will change colour when the requirement is fulfilled.
export function requirementStatusString(req: LessonRequirement): DebugRequirementStatusDisplay {
    let details = "Unknown Requirement";
    let progress = "";

    switch (req.reqType) {
    case (StepRequirementType.CHANGES_MADE):
        break;
    
    case (StepRequirementType.CONSOLE_OUTPUT):
        break;

    case (StepRequirementType.FAILED_ATTEMPTS):
        details = "Expecting " + (req.numValue ?? 0) + " failed attempts to go to the next Step: ";
        progress = useStore().getNextStepAttempts + "/" + (req.numValue ?? 0);
        break;
    
    case (StepRequirementType.PYTHON_PRESENT):
        break;

    case (StepRequirementType.PYTHON_NOT_PRESENT):
        break;
    
    case (StepRequirementType.RUN_CODE):
        details = "Expecting the user to run their code.";
        progress = (checkRequirement(req) ? "O" : "X");
        break;
    
    case (StepRequirementType.TIME_PASSED):
        details = "Expecting the user to spend " + (req.numValue ?? 0) + " seconds on this Step: ";
        progress = Math.floor(((Date.now() - useStore().getTimeNewStepOpened) / 1000)) + "/" + (req.numValue ?? 0) + "s";
        break;
    }
    // This message is more of a notification to developers that a newly implemented requirement type is missing a message here. The educator should not be seeing it.
    return {detailsText: details, progressText: progress, status: checkRequirement(req)};
}

// When the student has not fulfilled a requirement, this message appears to guide them (in case the teacher has not put hints). 
// Only one message will be displayed at a time, being the top unfulfilled requirement.
// hideExpectedValue is controlled by a Step Attribute, determining whether to tell the student what the requirement is looking for. Only applies to some Requirement types.
export function requirementMessage(req: LessonRequirement, hideExpectedValue: boolean): string {
    if(!req) { // If the method is called with no unfulfilled requirements, it will pass undefined
        return "";
    }

    // Computes the status of a Requirement
    switch (req.reqType) {
    case (StepRequirementType.CHANGES_MADE):
        return "You have not made any changes to your code.";
    
    case (StepRequirementType.CONSOLE_OUTPUT):
        if(hideExpectedValue) {
            return "Your code's output is not as expected.";
        }
        else {
            return "Your code's output is not as expected. The code should be outputting: '" + req.textValue + "'.";
        }

    case (StepRequirementType.FAILED_ATTEMPTS):
        return ""; // This Requirement Type cannot be used for Steps, only Hints. There is no use for a message here as it will never be displayed due to enforcements by the parser.
        
    case (StepRequirementType.PYTHON_NOT_PRESENT):
        if(hideExpectedValue) {
            return "Your code contains content that shouldn't be present.";
        }
        else {
            return "Your code contains content that shouldn't be present: '" + req.textValue + "'.";
        }

    case (StepRequirementType.PYTHON_PRESENT):
        if(hideExpectedValue) {
            return "Your code is missing content that should be present.";
        }
        else {
            return "Your code is missing content that should be present: '" + req.textValue + "'.";
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
    present = step.hints.some((h) => h.requirements.some((r) => r.reqType === type));

    return present;
}