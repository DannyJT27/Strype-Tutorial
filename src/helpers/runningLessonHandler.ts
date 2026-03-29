// Helper function for starting/stopping active Lessons

import { useStore } from "@/store/store";
import { LessonParseResult } from "@/types/types";
import { resetRequirementValues } from "./lessonRequirementHandler";

export function stopCurrentLesson(): void {
    if(useStore().isRunningLesson) {
        // Reset all info from the previous lesson
        useStore().setIsRunningLessonStatus(false); // Hides the lesson panel
        useStore().lessonResetStepIndexes();
        useStore().clearLessonStepsArray;
    }
    // No actions involving deleting the current project, as it's better for a student to be able to keep their work when the lesson is stopped
}

export function startLesson(parseResult: LessonParseResult, source: string[], testMode?: boolean, startingStep?: number): void {
    if(!parseResult.success || parseResult.ERRORS.length > 0) {
        // Prevent this function from running when there are errors present
        return;
    }

    // All store-related actions required to set up a Lesson
    // This is run AFTER starting a new project or the uploading of an initial file if needed, so that is handled elsewhere and assumed to be complete by this point.

    // -- Stop the previous lesson if necessary
    stopCurrentLesson();

    // -- Load information into the store
    useStore().setLessonStepsArray(parseResult.steps);
    useStore().setLessonInTestModeStatus(testMode ?? false);
    useStore().setCurrentLessonObject({details: parseResult.details, sourceLines: source});

    // -- Reset Requirement values in case the first step has any
    resetRequirementValues(); // Handles all requirement-related values

    // -- Set running lesson back to true now that the new data is ready
    useStore().setIsRunningLessonStatus(true);

    // -- Jump to specified starting step if applicable
    if(startingStep) {
        useStore().lessonSetStepIndex(startingStep - 1);
    }
}