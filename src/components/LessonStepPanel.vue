<template>
    <div class="step-panel-base"> 
        <div 
            v-if="panelHidden" 
            class="step-panel-hidden" 
            :class="['step-panel-content' , 'scheme-' + getColourScheme]"
            @click="clickSetHidePanel(false)"
        >
            Show Lesson Panel
        </div>
        <div 
            v-else-if="showingEndScreen" 
            style="align-items: center; text-align: center; padding: 20px; gap: 10px;"
            :class="['step-panel-content' , 'scheme-' + getColourScheme]"
        >
            <div class="step-panel-end-screen-text" style="font-weight: bold; color: #033d00; font-style: italic; font-size: 34px;">
                Lesson Complete!
            </div>
            <div class="step-panel-end-screen-text">
                '{{ lessonTitle }}'
            </div>
            <div class="step-panel-end-screen-text" style="margin-top: auto; font-size: 24px;">
                {{ getCompletionTimeDisplay() }}
                <span v-if="runningTestMode"><br><b>Return to the editor to download this Lesson File.</b></span>
            </div>
            <button class="step-panel-button-finish-lesson" style="margin-top: auto;" @click="clickFinishLesson">
                Finish Lesson
            </button>
            <div class="step-panel-end-screen-text" style="font-size: 16px; font-style: italic;">
                (Your code will not be erased)
            </div>
            <div style="width: 100%;">
                <button class="step-panel-button-arrow" @click="clickBackFromCompletePage">
                    &lt;
                </button>
            </div>
        </div>
        <div v-else class="step-panel-base"> <!-- Full height and width of parent div. The positioning of the panel is controlled in App.vue -->
            <div class="step-panel-progress-bar">
                <!-- Note that 'v-for' starts for loops at 1, hence why i-1 is used -->
                <button 
                    v-for="i in totalLessonSteps" :key="i"
                    class="step-panel-progress-bar-button"
                    :class="[progressBarButtonSubclass(i - 1), 'scheme-' + getColourScheme]"
                    @click="jumpToStep(i - 1)"
                />
            </div>
            <div :class="['step-panel-content' , 'scheme-' + getColourScheme]">
                <!-- Top Content Div - Progress Counter and misc buttons -->
                <div class="step-panel-content-top">
                    <p class="step-panel-progress-number-text">
                        {{ progressCountDisplay }}
                    </p>
                    <div class="step-panel-button-wrapper" :style="{ paddingTop: '4px' }">
                        <!-- Hide Panel Button - only appears on certain panel types that cover the editor -->
                        <button class="step-panel-button-misc" @click="clickSetHidePanel(true)">
                            <img src="@/assets/images/hide-panel-icon.svg" :style="{maxWidth: '95%', height: 'auto'}">
                        </button>
                        <!-- Hint Button - always appears, but will be disabled when a hint is unavailable -->
                        <button
                            id="show-hint-button" 
                            class="step-panel-button-misc" 
                            @click="showHint" 
                            :disabled="stepDetails.hints.length < 1 || !currentStepIsLatest"
                        >
                            ?
                        </button>
                        <!-- Popover connected to the Hint button to display a hint message -->
                        <b-popover
                            target="show-hint-button"
                            triggers="manual"
                            placement="top"
                            :show.sync="showHintMessage"
                        >
                            {{ hintMessageDisplay }}
                        </b-popover>
                    </div>
                </div>

                <!-- Middle Content Div - Actual text content imported from the Step's data -->
                <div class="step-panel-content-middle">
                    <div class="step-panel-text-scrolling-wrapper">
                        <p class="step-panel-main-text" :style="{textAlign: 'center', fontSize: '1.1em'}">
                            {{ stepDetails.textContent }}
                        </p>
                    </div>
                </div>
                
                <!-- Bottom Content Div - Arrow buttons and TEST MODE text -->
                <div class="step-panel-content-bottom">
                    <p 
                        class="step-panel-test-mode-text"
                        v-if="runningTestMode"
                        @click="openTestModeDlg"
                    > 
                        &nbsp;VIEW DEBUG INFO
                    </p>
                    <LessonTestModeDlg ref="testModeDlg" :dlgId="testModeDlgId" v-if="runningTestMode"/> <!-- Modal component, all data for it is handled inside the component .vue file -->
                    <div class="step-panel-button-wrapper">
                        <!-- Prev Step Arrow - Disabled on first step -->
                        <button 
                            class="step-panel-button-arrow" 
                            @click="prevStep" 
                            :disabled="currentStepIsFirst"
                        >
                            &lt;
                        </button>
                        <!-- Next Step Arrow - Changes colour when Requirements are not fulfilled -->
                        <button 
                            id="next-step-button" 
                            class="step-panel-button-arrow" 
                            @click="tryNextStep" 
                            :style="{ backgroundColor: (currentStepIsLatest && incompleteStepReqs.length > 0) ? '#ffc267' : ''}"
                        >
                            &gt;
                        </button>
                        <!-- Popover connected to the Next Step button to display unfulfilled Requirement guidance -->
                        <b-popover
                            target="next-step-button"
                            triggers="manual"
                            placement="top"
                            :show.sync="showRequirmentMessage"
                        >
                            {{ requirementMessageDisplay }}
                        </b-popover>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <!-- Placeholder text
    Create a <b>Variable</b> called <i>"userGuess"</i> which will take the user's <b>Input</b>.
    After that, compare the inputted value to your randomly generated number. If they are equal, the user wins. 
    If not, inform the user with a <b>Print</b> statment whether their guess is too high or too low.
    Here is some more text to test the boundaries of this box. Here is some more text to test the boundaries of this box.
    -->
</template>

<script lang="ts">
//////////////////////
//      Imports     //
//////////////////////
import Vue from "vue";
import { useStore } from "@/store/store";
import scssVars from "@/assets/style/_export.module.scss";
import { LessonStepDetails, StepPanelType, LessonRequirement } from "@/types/types";
import { getIncompleteRequirements, requirementMessage, resetRequirementValues } from "@/helpers/lessonRequirementHandler";
import LessonTestModeDlg from "@/components/LessonTestModeDlg.vue";
import { completeLesson, stopCurrentLesson } from "@/helpers/runningLessonHandler";

//////////////////////
//     Component    //
//////////////////////

// If the store has problems loading a step, this will be used instead.
const errorLessonStepDisplay: LessonStepDetails = {
    stepRef: "errorDisplayingStep",
    requirements: [],
    hints: [],

    attributes: {panelType: StepPanelType.LEFT_POPUP},
    textContent: "ERROR LOADING STEP DETAILS - CHECK CONSOLE FOR MORE INFORMATION",
};

export default Vue.extend({
    name: "LessonStepPanel",

    components: {LessonTestModeDlg},

    data: function() {
        return {
            incompleteStepReqs: [] as LessonRequirement[], // List of Step Requirements that have not been fulfilled

            showRequirmentMessage: false, // Controls popup message when clicking Next with incomplete Requirements

            requirementMessagePopoverTimer: null as number | null, // Used to prevent issues when the next step button is repeatedly clicked

            hintDisplayIndex: -1, // The index of the hint to display from the current step's hint list, with -1 being a placeholder message

            showHintMessage: false, // Controls popup message when clicking Hint

            hintMessagePopoverTimer: null as number | null, // Used to prevent issues when the hint button is repeatedly clicked

            failedAttemptCooldownTimer: null as number | null, // Used to stop the user from being able to spam failed attempts
        };
    },

    computed: {
        scssVars() {
            // just to be able to use in template
            return scssVars;
        },

        StepPanelType() {
            return StepPanelType;
        },

        lessonTitle(): string {
            return useStore().getCurrentLesson?.details.title ?? "Unnamed Lesson"; // Default value is green for Strype Colour Scheme
        },

        // Loads the information of the currently selected step from the store
        stepDetails(): LessonStepDetails {
            // Component should only be displayed when there is valid step information in the store (handled in App.vue)
            return useStore().getCurrentStepAttributes ?? errorLessonStepDisplay;
        },
        
        totalLessonSteps() {
            return useStore().getTotalLessonSteps ?? 0;
        },

        unlockedLessonSteps() {
            return useStore().getUnlockedLessonStepIndex ?? 0;
        },

        currentStepIsFirst() {
            return useStore().getCurrentLessonStepIndex == 0;
        },

        currentStepIsLatest() {
            return useStore().isCurrentStepLastUnlocked ?? false;
        },

        runningTestMode() {
            return useStore().getLessonInTestMode ?? false;
        },

        // Builds the progress display in the top left of the component
        progressCountDisplay(): string {
            if(useStore().getTotalLessonSteps > 0) {
                return (useStore().getCurrentLessonStepIndex + 1) + "/" + useStore().getTotalLessonSteps;
            }
            return "?/?"; // Failsafe
        },

        requirementMessageDisplay(): string {
            if(this.incompleteStepReqs.length > 0) {
                return requirementMessage(this.incompleteStepReqs[0], useStore().getCurrentStepAttributes.attributes.hideRequirementExpectedValues ?? false);
            }
            return "";
        },

        hintMessageDisplay(): string {
            if(useStore().getCurrentStepAttributes.hints.length > this.hintDisplayIndex && this.hintDisplayIndex != -1) {
                return useStore().getCurrentStepAttributes.hints[this.hintDisplayIndex].message;
            }

            return useStore().getLessonInTestMode 
                ? "No Hints are currently enabled due to unfulfilled Requirements."  // test mode exclusive
                : "Give the task a go first! Come back here later for help if you need it." ;
            // ^ Note that this message will only display when there ARE hints on this step, but all of them are locked behind requirements. 
            // When there are no hints at all, the button is disabled.
            // If an educator wants to overwrite this message, they can simply put the new message in a hint with no requirements.
        },

        getColourScheme(): string {
            return useStore().getCurrentStepAttributes.attributes.colourScheme ?? "green"; // Default value is green for Strype Colour Scheme
        },

        testModeDlgId(): string {
            return "test-mode-modal-dlg";
        },

        panelHidden(): boolean {
            return useStore().getLessonStepPanelHidden;
        },

        showingEndScreen(): boolean {
            return useStore().getLessonEndScreenShown ?? false; // Default value is green for Strype Colour Scheme
        },
    },

    methods: {
        // Main methods for navigating between steps
        tryNextStep(): void {
            // Hide the hint message popover if it exists
            if (this.hintMessagePopoverTimer) {
                clearTimeout(this.hintMessagePopoverTimer);
                this.showHintMessage = false;
            }

            const currentStep = useStore().getCurrentStepAttributes;

            // Checks 3 conditions:
            // 1. whether the current step index is the furthest unlocked one, as requirements only apply to this step.
            // 2. whether the current step has requirements assigned to it.
            // 3. whether disableRequirements is toggled (if in test mode)
            if(useStore().isCurrentStepLastUnlocked && currentStep.requirements.length > 0 && !(useStore().getLessonInTestMode && useStore().getLessonTestModeConfig.disableRequirements) ) {
                // All requirements must be fulfilled in order for the user to go to the next step
                this.incompleteStepReqs = getIncompleteRequirements(currentStep.requirements);

                if (!this.failedAttemptCooldownTimer) {
                    useStore().lessonIncNextStepFailedAttempts(); // +1 to the attempts counter
                    this.failedAttemptCooldownTimer = window.setTimeout(() => {
                        this.failedAttemptCooldownTimer = null; // Clear timer after the cooldown expires
                    }, 3000);
                }

                // Reset Pop-over display timer if it exists (created below)
                if (this.requirementMessagePopoverTimer) {
                    clearTimeout(this.requirementMessagePopoverTimer);
                }

                // Only go next when enough requirements are fulfilled
                if(currentStep.requirements.length - (currentStep.attributes.minRequirements ?? currentStep.requirements.length) >= this.incompleteStepReqs.length) {
                    if(useStore().isLessonOnLastStep) {
                        // Instead of incrementing step index, show end screen
                        completeLesson();
                    }
                    else {
                        useStore().lessonIncStepIndex();
                        resetRequirementValues(); // <- Must be called after incStepIndex
                        this.incompleteStepReqs = getIncompleteRequirements(currentStep.requirements);
                        
                    }
                    this.showRequirmentMessage = false;
                }
                else {
                    // Display the requirment popover for a period of time
                    this.showRequirmentMessage = true;
                    this.requirementMessagePopoverTimer = window.setTimeout(() => {
                        this.showRequirmentMessage = false;
                    }, 4000);
                }
            }
            else {
                // The code above does not run when no requirements are present, even when on the latest step
                if(useStore().isLessonOnLastStep) {
                    // Instead of incrementing step index, show end screen
                    completeLesson();
                }
                else if(useStore().isCurrentStepLastUnlocked) {
                    useStore().lessonIncStepIndex();
                    resetRequirementValues();
                    // Structured like this because isCurrentStepLastUnlocked needs to be checked 
                    // before incrementing, but resetRequirementValues can only be run after incrementing.
                }
                else {
                    useStore().lessonIncStepIndex();
                }

                // Check again for isCurrentStepLastUnlocked after incrementing to see if requirements need to be updated
                if(useStore().isCurrentStepLastUnlocked && currentStep.requirements.length > 0) {
                    // Update requirement checks, but only if needed (when next step is last one unlocked)
                    this.incompleteStepReqs = getIncompleteRequirements(currentStep.requirements);
                }
            }
        },

        prevStep(): void {
            // This will only be called when there is a previous step. The button will be disabled when this isn't the case.
            useStore().lessonDecStepIndex();

            // Hide popovers
            if (this.requirementMessagePopoverTimer) {
                clearTimeout(this.requirementMessagePopoverTimer);
                this.showRequirmentMessage = false;
            }
            if (this.hintMessagePopoverTimer) {
                clearTimeout(this.hintMessagePopoverTimer);
                this.showHintMessage = false;
            }
        },

        jumpToStep(index: number): void {
            useStore().lessonSetStepIndex(index);

            // Hide popovers
            if (this.requirementMessagePopoverTimer) {
                clearTimeout(this.requirementMessagePopoverTimer);
                this.showRequirmentMessage = false;
            }
            if (this.hintMessagePopoverTimer) {
                clearTimeout(this.hintMessagePopoverTimer);
                this.showHintMessage = false;
            }
        },

        // Main method for choosing a hint to display
        showHint(): void {
            // Hide the requirement message popover if it exists
            if (this.requirementMessagePopoverTimer) {
                clearTimeout(this.requirementMessagePopoverTimer);
                this.showRequirmentMessage = false;
            }

            // Obtain a list of all hints that have their requirements fully completed by filtering out hints with incomplete requirements
            const validHints = useStore().getCurrentStepAttributes.hints.filter((h) => getIncompleteRequirements(h.requirements).length == 0);

            // If no unlocked hints, set index to 0 to return a placeholder message and break early
            if(validHints.length == 0) {
                this.hintDisplayIndex = -1;
            }
            else {
                // Choose which hint to display based on the attributes of the step
                const hintToDisplay = validHints[0];

                // Find the index of the hint in the original full list and set hintDisplayIndex accordingly
                this.hintDisplayIndex = useStore().getCurrentStepAttributes.hints.findIndex((h) => h === hintToDisplay);
            }

            // Now that the hint is chosen, show the popover
            if (this.hintMessagePopoverTimer) {
                // Erase previous popover timer if it exists
                clearTimeout(this.hintMessagePopoverTimer);
            }
            this.showHintMessage = true;
            this.hintMessagePopoverTimer = window.setTimeout(() => {
                this.showHintMessage = false;
            }, 6000);
        },

        clickSetHidePanel(hidden: boolean) {
            useStore().setLessonStepPanelHidden(hidden);
        },

        clickBackFromCompletePage() {
            useStore().setLessonEndScreenShown(false);
        },

        clickFinishLesson() {
            stopCurrentLesson();
        },

        /* Used to determine the colour a progress bar segment should display
         * 'completed' - Step is completed and can be jumped to, current selected step is ahead of it
         * 'current' - Step is currently selected
         * 'unlocked' - Step is unlocked and can be jumped to, current selected step is behind it (only seen if user completes steps and then goes back to earlier step)
         * 'locked' - Step is still locked and can NOT be jumped to.
         */
        progressBarButtonSubclass(index: number): string {
            // Note that this method just returns a CSS subclass. The actual designs of each button are handled in <style>.
            if (index < useStore().getCurrentLessonStepIndex) {
                return "completed";
            }
            if (index == useStore().getCurrentLessonStepIndex) {
                return "current";
            }
            // If here is reached, then index > useStore().currentLessonStepIndex
            if (index <= useStore().getUnlockedLessonStepIndex) {
                return "unlocked";
            }
            // If here is reached, then the step is locked
            return "locked";
        },

        // Opens the debug menu modal
        openTestModeDlg(): void {
            (this.$refs.testModeDlg as InstanceType<typeof LessonTestModeDlg>).updateCards();
            this.$root.$emit("bv::show::modal", this.testModeDlgId);
        },

        getCompletionTimeDisplay(): string {
            const difference = useStore().getTimeLessonEnded - useStore().getTimeLessonStarted;
            const minutes = Math.floor(difference / 60000);
            const seconds = Math.floor((difference - (minutes * 60000)) / 1000);
            return ("Completed in " + minutes + " minutes and " + seconds + " seconds.");
        },
    },
});
</script>

<style scoped lang="scss">

// definitions of colour schemes, containing colour variables to use in other classes
.scheme-green { // default
    --progress-completed: #6ed144;
    --progress-current: #00b100;
    --bg-gradient-top: #9ab78e;
    --bg-gradient-bottom: #5b7451;
}

.scheme-red {
    --progress-completed: #d14444;
    --progress-current: #b10000;
    --bg-gradient-top: #b78e8e;
    --bg-gradient-bottom: #684a4a;
}

.scheme-orange {
    --progress-completed: #dd9f59;
    --progress-current: #e6800c;
    --bg-gradient-top: #caab6e;
    --bg-gradient-bottom: #725a38;
}

.scheme-blue {
    --progress-completed: #4446d1;
    --progress-current: #0012b1;
    --bg-gradient-top: #8f8eb7;
    --bg-gradient-bottom: #4a4b68;
}

.scheme-pink {
    --progress-completed: #e44ce9;
    --progress-current: #c506d6;
    --bg-gradient-top: #dfa6df;
    --bg-gradient-bottom: #835d85;
}

.scheme-monochrome {
    --progress-completed: #cacaca;
    --progress-current: #e9e9e9;
    --bg-gradient-top: #b4b4b4;
    --bg-gradient-bottom: #666666;
}

// rest of the css
.step-panel-base {
    height: 100%;
    background: black;
    display: flex;
    flex-direction: column;
}

.step-panel-hidden {
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    font-weight: bold;
    color: black;
    line-height: 1.2;
}

.step-panel-hidden:hover {
    cursor: pointer;
    filter: brightness(1.5);
    color: rgb(46, 46, 46);
}

.step-panel-progress-bar {
    display: flex; //for the buttons
    height: 20px;
    flex-shrink: 0; //can't squish the bar out of existence
    border-bottom: 1px solid black;
}

.step-panel-progress-bar-button { //base settings for all buttons
    flex: 1;
    border: none;
    position: relative; //for the circle
}

.step-panel-progress-bar-button.completed {
    cursor: pointer;
    background: var(--progress-completed);
}

.step-panel-progress-bar-button.current {
    cursor: pointer;
    background: var(--progress-current);
    pointer-events: none; //prevents hover effect
}

.step-panel-progress-bar-button.unlocked {
    cursor: pointer;
    background: #acacac;
}

.step-panel-progress-bar-button.locked {
    cursor: default;
    background: #7e7e7e;
    pointer-events: none; //prevents hover effect
}

.step-panel-progress-bar-button:hover {
    filter: brightness(1.1) saturate(1.1);
}

// circle inside each button for better visuals
.step-panel-progress-bar-button::after {
    content: "";
    position: absolute;
    width: 6px;
    height: 6px;
    border-radius: 50%; //circle
    background-color: white;
    opacity: 25%;
    //centering vvv
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
}

.step-panel-content {
    height: 100%;
    background: linear-gradient(var(--bg-gradient-top), var(--bg-gradient-bottom));
    display: flex;
    flex-direction: column;
}

.step-panel-content-top {
    height: 30px;
    display: flex;
    align-items: center;
    box-sizing: border-box;
    padding-right: 4px;
}

// This div holds the text inputted by the step's data, so it will need to handle all sorts of customized text.
// Note that only fixed style attributes are defined here, with the rest determined in a function involving the step's attributes.
.step-panel-content-middle {
    flex: 1 1 0;
    min-height: 0; //allows inner scroll to shrink
    overflow: hidden;
    padding: 0px 36px; //horizontal padding
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
}

.step-panel-content-bottom {
    height: 25px; //needs to be taller than arrow buttons
    display: flex;
    align-items: center;
    box-sizing: border-box;
    padding-right: 4px;
}

// Makes text content scrollable when necessary
.step-panel-text-scrolling-wrapper {
    flex: 1 1 0;
    min-height: 0;
    overflow-y: auto;  //enables scrolling with oversized input - a Recommendation is given when text is too long to break it into multiple steps.
    scrollbar-color: auto transparent; // Removes the background of the scroll bar when it is present (Firefox compatibility)
}

// Custom styled scrollbar
.step-panel-text-scrolling-wrapper::-webkit-scrollbar {
    width: 4px;
}
.step-panel-text-scrolling-wrapper::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.4);
    border-radius: 4px;
}
.step-panel-text-scrolling-wrapper::-webkit-scrollbar-track {
    background: transparent;
}

// Most of the styling here is handled in a function elsewhere for customizable input
.step-panel-main-text {
    margin: 0; //removes some defaults that were breaking positioning
    overflow-wrap: break-word;
    word-break: break-word; //incase of a very long word
    scrollbar-width: thin;
    color: black;
}

.step-panel-progress-number-text {
    margin: 0; //removes some defaults that were breaking positioning
    font-size: 15px;
    font-weight: bold;
    font-style: italic;
    color: lightgray;
    position: relative;
    left: 4px;
    text-shadow: 1px 1px 0 black; //better visibility - needed when bg colour is customisable
}

.step-panel-test-mode-text {
    margin-top: auto; //pushes to bottom of div
    font-size: 14px;
    font-style: italic;
    color: rgb(255, 200, 125);
    opacity: 80%;
    position: relative;
    left: 4px;
    top: 2px;
    text-shadow: 2px 2px 0 black; //better visibility - needed when bg colour is customisable
    // clickable design part
    cursor: pointer;
}

.step-panel-test-mode-text:hover {
    color: white;
    text-shadow: 0 0 6px gray, 0 0 12px gray;
}

//Allows multiple buttons to be positioned in a fixed row
.step-panel-button-wrapper {
    margin-left: auto;
    display: flex;
    gap: 6px;
}

//Hint, Hide, etc. (buttons that aren't the arrows)
.step-panel-button-misc {
    all: unset; //remove browser defaults for consistency across browsers
    border: 2px solid #000000;
    background: #ffffff;
    color: rgb(0, 0, 0);
    cursor: pointer;
    width: 24px;
    height: 24px;
    border-radius: 50%; //makes button round
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 0px; //better centering
}

.step-panel-button-misc:disabled {
    opacity: 0.4;
    cursor: default;
    border-color: #080808;
    color: #888;
    background: #e0e0e0;
}

.step-panel-button-misc:hover {
    background: #e0e0e0;
}

//Next + Prev Step
.step-panel-button-arrow {
    all: unset; //remove browser defaults for consistency across browsers
    border: 2px solid #000000;
    background: #ffffff;
    color: rgb(0, 0, 0);
    cursor: pointer;
    width: 60px;
    height: 18px;
    border-radius: 1000px; //rounded edges without oval shape
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 0px; //better centering
}

.step-panel-button-arrow:disabled {
    opacity: 0.4;
    cursor: default;
    border-color: #080808;
    color: #888;
    background: #e0e0e0;
}

.step-panel-button-arrow:hover {
    background: #e0e0e0; //same as disabled colour so that it doesn't change
}

.step-panel-end-screen-text {
    flex: 0;
    color: black;
    font-size: 30px;
    white-space: normal;
}

.step-panel-button-finish-lesson {
    all: unset; //remove browser defaults for consistency across browsers
    border: 4px solid #000000;
    background: #c9c9c9;
    color: rgb(0, 0, 0);
    cursor: pointer;
    width: 200px;
    height: 40px;
    font-size: 25px;
    border-radius: 1000px; //rounded edges without oval shape
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 0px; //better centering
    box-shadow: 0px 0px 4px black;
}

.step-panel-button-finish-lesson:hover {
    background: #ececec;
}

</style>