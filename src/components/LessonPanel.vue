<template>
    <div class="step-panel-base"> <!-- Full height and width of parent div. The positioning of the panel is controlled in App.vue -->
        <div class="step-panel-progress-bar">
            <!-- TBC -->
        </div>
        <div class="step-panel-content">
            <!-- Top Content Div - Progress Counter and misc buttons -->
            <div class="step-panel-content-top">
                <p class="step-panel-progress-number-text">
                    1/16 <!-- PLACEHOLDER TEXT -->
                </p>
                <div class="step-panel-button-wrapper" :style="{ paddingTop: '4px' }">
                    <!-- Hide Panel Button - only appears on certain panel types that cover the editor -->
                    <button class="step-panel-button-misc">
                        H
                    </button>
                    <!-- Hint Button - always appears, but will be disabled when a hint is unavailable -->
                    <button class="step-panel-button-misc">
                        ?
                    </button>
                </div>
            </div>

            <!-- Middle Content Div - Actual text content imported from the Step's data -->
            <div class="step-panel-content-middle">
                <div class="step-panel-text-scrolling-wrapper">
                    <p class="step-panel-main-text" :style="{textAlign: 'center', fontSize: '1.1em'}">  <!-- PLACEHOLDER STYLING -->
                        Create a <b>Variable</b> called <i>"userGuess"</i> which will take the user's <b>Input</b>.  <!-- PLACEHOLDER TEXT -->
                        After that, compare the inputted value to your randomly generated number. If they are equal, the user wins. 
                        If not, inform the user with a <b>Print</b> statment whether their guess is too high or too low.
                        Here is some more text to test the boundaries of this box. Here is some more text to test the boundaries of this box.
                        
                    </p>
                </div>
            </div>
            
            <!-- Bottom Content Div - Arrow buttons and TEST MODE text -->
            <div class="step-panel-content-bottom">
                <p class="step-panel-test-mode-text" v-if="true">  <!-- PLACEHOLDER CONDITION -->
                    ! TEST MODE
                </p>
                <div class="step-panel-button-wrapper">
                    <!-- Hide Panel Button - only appears on certain panel types that cover the editor -->
                    <button class="step-panel-button-arrow">
                        &lt;
                    </button>
                    <!-- Hint Button - always appears, but will be disabled when a hint is unavailable -->
                    <button class="step-panel-button-arrow">
                        &gt;
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
//////////////////////
//      Imports     //
//////////////////////
import Vue from "vue";
import { useStore } from "@/store/store";
import { mapStores } from "pinia";
import scssVars from "@/assets/style/_export.module.scss";

//////////////////////
//     Component    //
//////////////////////
export default Vue.extend({
    name: "LessonPanel",

    computed: {
        ...mapStores(useStore),

        scssVars() {
            // just to be able to use in template
            return scssVars;
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
    height: 20px;
    background: green;
    flex-shrink: 0; //can't squish the bar out of existence
    border-bottom: 1px solid black;
}

.step-panel-content {
    height: 100%;
    background: #9ab78e;
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
    height: 25px; //should remain same as arrow buttons + 1
    display: flex;
    align-items: center;
    box-sizing: border-box;
    padding-right: 4px;
}

// Makes text content scrollable when necessary
.step-panel-text-scrolling-wrapper {
    flex: 1 1 0;
    min-height: 0;
    overflow-y: auto;  //enables scrolling with oversized input - a Reccomendation is given when text is too long to break it into multiple steps.
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
    color: gray;
    position: relative;
    left: 4px;
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

// Temporary black rectangle overlay for testing displayed panels
.step-panel-black-debug {
    width: 100%;
    height: 100%;
    background: black;
}

</style>