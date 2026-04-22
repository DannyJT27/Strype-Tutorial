// Helper function for starting/stopping active Lessons

import { useStore } from "@/store/store";
import { LessonParseResult, LessonTestModeConfig } from "@/types/types";
import { resetRequirementValues } from "./lessonRequirementHandler";
import App from "@/App.vue";

export function stopCurrentLesson(): void {
    if(useStore().isRunningLesson) {
        // Reset all info from the previous lesson
        useStore().setIsRunningLessonStatus(false); // Hides the lesson panel
        useStore().lessonResetStepIndexes();
        useStore().clearLessonStepsArray;
    }
    // No actions involving deleting the current project, as it's better for a student to be able to keep their work when the lesson is stopped
}

export function startLesson(parseResult: LessonParseResult, source: string[]): void {
    if(!parseResult.success || parseResult.debugMessages.some((m) => ["error", "fatal"].includes(m.messageType))) {
        // Prevent this function from running when there are errors present
        return;
    }

    // All store-related actions required to set up a Lesson
    // This is run AFTER starting a new project or the uploading of an initial file if needed, so that is called beforehand and assumed to be complete by this point.

    // -- Stop the previous lesson if necessary
    stopCurrentLesson();

    // -- Load information into the store
    useStore().setLessonStepsArray(parseResult.steps);
    useStore().setCurrentLessonObject({details: parseResult.details, sourceLines: source});
    useStore().setTimeLessonStartedToNow();
    useStore().setLessonCompleted(false);
    useStore().setLessonEndScreenShown(false);


    // -- Jump to specified starting step if applicable
    if(useStore().getLessonInTestMode) {
        useStore().lessonSetStepIndex(useStore().getLessonTestModeConfig.initialStep - 1);
    }

    // -- Reset Requirement values in case the first step has any
    resetRequirementValues();

    // -- Set running lesson back to true now that the new data is ready
    useStore().setIsRunningLessonStatus(true);
}

export function completeLesson(): void {
    // Runs whenever the end screen is opened, but only does things if its the first time
    if(!useStore().getLessonCompleted) {
        useStore().setLessonCompleted(true);
        useStore().setTimeLessonEndedToNow();
    }
    useStore().setLessonEndScreenShown(true); // show end screen
}

export function loadLessonProject(parseResult: LessonParseResult, source: string[], root: InstanceType<typeof App>, ignoreInitial?: boolean): void {
    // Handles either uploading the initial project file, or emtpying the IDE upon starting a lesson.
    // Same logic as Menu.vue's loadProject() method, except it skips all the file-loading parts since the file is already available as a string
    if(!parseResult.details.initialFileType || !parseResult.details.initialFileFirstLine || ignoreInitial) {
        // No initial file. 
        // This needs to clear the editor entirely, which is done by just 'opening' an empty .py file (since the existing 'new project' functionality just refreshes the page)
        // A .spy file could be slightly faster, but it contains IDE settings which would override the user's settings.
        root.setStateFromPythonFile(
            " ",
            parseResult.details.title.slice(0, 50) + ".py",
            Date.now(),
            true
        );
    }
    else {
        // Has initial file, which the parser will have already marked:
        const initialFileContent = source.slice(parseResult.details.initialFileFirstLine, -1).join("\n");

        if(initialFileContent) {
            root.setStateFromPythonFile(
                initialFileContent,
                parseResult.details.title.slice(0, 50) + "." + parseResult.details.initialFileType,
                Date.now(),
                true
            );
        }
    }
}

export function updateTestModeSettings(testMode: boolean, config?: LessonTestModeConfig): void {
    useStore().setLessonInTestModeStatus(testMode);
    useStore().updateLessonTestModeConfig(config ?? {
        // Default settings for when test mode is off
        initialStep: 1,
        disableRequirements: false,
        clearEditorOnStart: true,
        enforceInitialFile: true,
    });
}