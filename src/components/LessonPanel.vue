<template>
    <div class="step-panel-base"> <!-- Full height and width of parent div. The positioning of the panel is controlled in App.vue -->
        <div class="step-panel-progress-bar">
            <!-- Note that 'v-for' starts for loops at 1, hence why i-1 is used -->
            <button 
                v-for="i in totalLessonSteps" :key="i"
                class="step-panel-progress-bar-button"
                :class="progressBarButtonSubclass(i - 1)"
                @click="jumpToStep(i - 1)"
            />
        </div>
        <div class="step-panel-content">
            <!-- Top Content Div - Progress Counter and misc buttons -->
            <div class="step-panel-content-top">
                <p class="step-panel-progress-number-text">
                    {{ progressCountDisplay }}
                </p>
                <div class="step-panel-button-wrapper" :style="{ paddingTop: '4px' }">
                    <!-- Hide Panel Button - only appears on certain panel types that cover the editor -->
                    <button class="step-panel-button-misc" @click="loadsomedataintostore">
                        H
                    </button>
                    <!-- Hint Button - always appears, but will be disabled when a hint is unavailable --> <!-- TBC: DISABLED CONDITION WITH HINT NEEDED-->
                    <button class="step-panel-button-misc" @click="runparser">
                        ?
                    </button>
                </div>
            </div>

            <!-- Middle Content Div - Actual text content imported from the Step's data -->
            <div class="step-panel-content-middle">
                <div class="step-panel-text-scrolling-wrapper">
                    <p class="step-panel-main-text" :style="{textAlign: 'center', fontSize: '1.1em'}">  <!-- PLACEHOLDER STYLING -->
                        {{ stepDetails.textContent }}
                    </p>
                </div>
            </div>
            
            <!-- Bottom Content Div - Arrow buttons and TEST MODE text -->
            <div class="step-panel-content-bottom">
                <p class="step-panel-test-mode-text" v-if="true">  <!-- PLACEHOLDER CONDITION -->
                    &nbsp;! TEST MODE   <!-- TBC: Hover popover that displays StepRef and fulfilled Requirements -->
                </p>
                <div class="step-panel-button-wrapper">
                    <!-- Prev Step Arrow - Disabled on first step -->
                    <button class="step-panel-button-arrow" @click="prevStep" :disabled="appStore.isLessonOnFirstStep">
                        &lt;
                    </button>
                    <!-- Next Step Arrow - Disabled when Requirements are not fulfilled -->
                    <button class="step-panel-button-arrow" @click="nextStep"> <!-- TBC: DISABLED CONDITION WITH REQUIREMENTS-->
                        &gt;
                    </button>
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
import { mapStores } from "pinia";
import scssVars from "@/assets/style/_export.module.scss";
import { LessonStepAttributes, StepPanelType } from "@/types/types";

import { parseFullLessonFile } from "@/helpers/lessonFileParser";

//////////////////////
//     Component    //
//////////////////////

// If the store has problems loading a step, this will be used instead.
const defaultStepDisplay: LessonStepAttributes = {
    stepRef: "errorDisplayingStep",
    panelType: StepPanelType.RIGHT_POPUP,
    textContent: "ERROR LOADING STEP DETAILS - CHECK CONSOLE FOR MORE INFORMATION",
};

//TEMP TEST STEP PANELS
const testStep1: LessonStepAttributes = {
    stepRef: "debugStep1",
    panelType: StepPanelType.RIGHT_POPUP,
    textContent: "Hello World.",
};
const testStep2: LessonStepAttributes = {
    stepRef: "debugStep2",
    panelType: StepPanelType.LEFT_POPUP,
    textContent: "Hello World again.",
};
const testStep3: LessonStepAttributes = {
    stepRef: "debugStep3",
    panelType: StepPanelType.FULLSCREEN_FOCUS_MODAL,
    textContent: "Hello World (loud).",
};

export default Vue.extend({
    name: "LessonPanel",

    computed: {
        ...mapStores(useStore),

        scssVars() {
            // just to be able to use in template
            return scssVars;
        },

        StepPanelType() {
            return StepPanelType;
        },

        // Loads the information of the currently selected step from the store
        stepDetails(): LessonStepAttributes {
            // Component should only be displayed when there is valid step information in the store (handled in App.vue)
            return this.appStore.getCurrentStepAttributes ?? defaultStepDisplay;
        },
        
        totalLessonSteps() {
            // IMPORTANT: Maximum step count of 40 to prevent rendering issues with progress bar.
            return this.appStore.getTotalLessonSteps;
        },

        unlockedLessonSteps() {
            return this.appStore.getUnlockedLessonStepIndex;
        },

        // Builds the progress display in the top left of the component
        progressCountDisplay(): string {
            if(this.appStore.getTotalLessonSteps > 0) {
                return (this.appStore.getCurrentLessonStepIndex + 1) + "/" + this.appStore.getTotalLessonSteps;
            }
            return "?/?"; // Failsafe
        },
    },

    methods: {
        // Main methods for navigating between steps

        nextStep() {
            // This should only be called when there is a next step. The button will be disabled when this isn't the case.
            this.appStore.lessonIncStepIndex();
        },

        prevStep() {
            // This should only be called when there is a previous step. The button will be disabled when this isn't the case.
            this.appStore.lessonDecStepIndex();
        },

        jumpToStep(index: number) {
            this.appStore.lessonSetStepIndex(index);
        },

        /* Used to determine the colour a progress bar segment should display
         * 'completed' - Step is completed and can be jumped to, current selected step is ahead of it
         * 'current' - Step is currently selected
         * 'unlocked' - Step is unlocked and can be jumped to, current selected step is behind it (only seen if user completes steps and then goes back to earlier step)
         * 'locked' - Step is still locked and can NOT be jumped to.
         */
        progressBarButtonSubclass(index: number) {
            // Note that this method just returns a CSS subclass. The actual designs of each button are handled in <style>.
            if (index < this.appStore.getCurrentLessonStepIndex) {
                return "completed";
            }
            if (index == this.appStore.getCurrentLessonStepIndex) {
                return "current";
            }
            // If here is reached, then index > this.appStore.currentLessonStepIndex
            if (index <= this.appStore.getUnlockedLessonStepIndex) {
                return "unlocked";
            }
            // If here is reached, then the step is locked
            return "locked";
        },

        //TEMP METHODS
        loadsomedataintostore() {
            console.error("Some default steps loaded into store");
            this.appStore.setLessonStepsArray([testStep1, testStep2, testStep3, testStep1, 
                testStep1, testStep1, testStep1, testStep1, testStep1, testStep1,
                testStep1, testStep1, testStep1, testStep1, testStep1, testStep1,
                testStep1, testStep1, testStep1, testStep1, testStep1, testStep1,
                testStep1, testStep1, testStep1, testStep1, testStep1, testStep1,
                testStep1, testStep1, testStep1, testStep1, testStep1, testStep1,
                testStep1, testStep1, testStep1, testStep1, testStep2, testStep1]); //40 steps
        },

        resetindexes() {
            this.appStore.lessonResetStepIndexes();
        },

        runparser() {
            this.appStore.setLessonStepsArray(parseFullLessonFile([
                "<#>Basic test of <step>",
                "and its subsections</#>",
                "<step Step1>",
                "   <text></text>",
                //"   </text>",
                "   <attributes falseParam>",
                //"       <colour-text red>",
                "       <panel-type>",
                "       <panel-type bar>",
                "       <panel-type popup-left>",
                //"       <attributes><#>Error here!</#>",
                "   </attributes>",
                "</step>",
                "<step Step1>",
                "   <text>Step 2.</text>",
                "   <#>Comment inside step</#>",
                "</step>",
            ]).steps);
        },
    },
});
</script>

<style scoped lang="scss">

.step-panel-base {
    height: 100%;
    background: black;
    display: flex;
    flex-direction: column;
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
    background: #6ed144;
}

.step-panel-progress-bar-button.current {
    cursor: pointer;
    background: #00b100;
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
    background: linear-gradient(#9ab78e, #78916f);
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

// Custom styled scrollbar (TBC: allegedly doesn't work on Firefox - will need to check)
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
    border-radius: 1000px; //rounded edges without oval shape (really not sure how this works but it does)
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

</style>