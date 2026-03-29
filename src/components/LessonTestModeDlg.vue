<template>
    <ModalDlg
        :dlgId="dlgId"
        :dlg-title="'Debug Information - ' + stepDetails.stepRef"
        showCloseBtn
        okOnly
        css-class="test-mode-dlg"
        size="lg"
        @shown="startRefreshTick"
        @hidden="stopRefreshTick"
    >
        <div class="test-mode-main-wrapper"> <!-- TBC MESSAGE ABOUT LOCKING FURTHER STEPS TO RE-ENABLE REQUIREMENTS AND HINTS ON A STEP-->
            <!-- Split into 3 main sections -->

            <!-- Section 1: Requirements -->
            <div class="test-mode-section">
                <div class="test-mode-section-title">Step Requirements</div>
                <div class="test-mode-section-body">
                    <div class="test-mode-info-text" v-if="stepDetails.requirements.length == 0">
                        This Step has no Requirements.
                    </div>
                    <div 
                        v-for="(req, i) in stepDetails.requirements"
                        :key="i"
                        class="test-mode-status-card"
                    >
                        <!-- Display card for each step requirement -->
                        <div class="test-mode-status-card-line-header" :style="{backgroundColor: getRequirementStatusCardColour(req)}">
                            <div class="test-mode-status-card-details-text">
                                {{ getRequirementStatusDetails(req) }}
                            </div>
                            <div class="test-mode-status-card-progress-text">
                                {{ getRequirementStatusProgressString(req) }}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Section 2: Hints -->
            <div class="test-mode-section">
                <div class="test-mode-section-title">Hints</div>
                <div class="test-mode-section-body">
                    <div class="test-mode-info-text" v-if="stepDetails.hints.length == 0">
                        This Step has no Hints.
                    </div>
                    <div 
                        v-for="(hint, i) in stepDetails.hints"
                        :key="i"
                        class="test-mode-status-card"
                    >
                        <!-- Display card for each hint -->
                        <div class="test-mode-status-card-line-header" :style="{backgroundColor: getHintStatusCardColour(hint)}">
                            <div class="test-mode-status-card-details-text">
                                "{{  getHintHeaderText(hint) }}"
                            </div>
                        </div>
                        <!-- Display all requirements for the hint-->
                        <div 
                            v-for="(req, j) in hint.requirements"
                            :key="j"
                            class="test-mode-status-card-line-extra"
                            :style="{backgroundColor: getRequirementStatusCardColour(req)}"
                        >
                            <div class="test-mode-status-card-details-text">
                                {{ getRequirementStatusDetails(req) }}
                            </div>
                            <div class="test-mode-status-card-progress-text">
                                {{ getRequirementStatusProgressString(req) }}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Section 3: Source Text -->
            <div class="test-mode-section">
                <div class="test-mode-section-title">Source Text</div>
                <!-- Extra informative message to explain text line wrapping, only showing if there is a long line -->
                <div class="test-mode-info-text" :style="{paddingBottom: '4px'}"  v-if="getStepSourceCode.some(line => line.length > 96)">
                    <b>
                        ⓘ Note that the parser for Lesson Files only splits lines by manually inputted line-breaks. 
                        It will not detect automatic text wrapping from your text editor. 
                        If a large segment of text is appearing with one line number, despite it appearing as multiple lines of text, consider splitting the segment up with manual line-breaks.
                    </b>
                </div>
                <div class="test-mode-status-card">
                    <div class="test-mode-status-card-line-extra" :style="{borderTop: 0}">
                        ...
                    </div>
                    <div
                        v-for="(line, i) in getStepSourceCode"
                        :key="i"
                        class="test-mode-status-card-line-extra"
                        :class="{ 'source-text-alt-line': i % 2 === 0 }"
                    >
                        <div class="test-mode-status-card-details-text test-mode-markup-text-display">
                            {{ line }}
                        </div>
                        <div class="test-mode-status-card-progress-text">
                            {{ i + (stepDetails.sourceLineNum || 0) }}
                        </div>
                    </div>
                    <div class="test-mode-status-card-line-extra" :class="{ 'source-text-alt-line': getStepSourceCode.length % 2 === 0 }">
                        ...
                    </div>
                </div>
            </div>
            <!-- Invisible render of an incrementing counter, refreshes the component display upon being changed every second -->
            <span :style="{display: 'none'}">{{ refreshTick }}</span>
        </div>
    </ModalDlg>
</template>

<script lang="ts">
//////////////////////
//      Imports     //
//////////////////////
import Vue from "vue";
import { useStore } from "@/store/store";
import { mapStores } from "pinia";
import { LessonHint, LessonRequirement, LessonStepDetails, StepPanelType, StepRequirementType } from "@/types/types";
import { requirementStatusString, getIncompleteRequirements, stepHasRequirement } from "@/helpers/lessonRequirementHandler";
import scssVars from "@/assets/style/_export.module.scss";
import ModalDlg from "@/components/ModalDlg.vue";

//////////////////////
//     Component    //
//////////////////////

// If the store has problems loading a step, this will be used instead.
const errorLessonStepDisplay: LessonStepDetails = {
    stepRef: "Error Loading Step, See Console",
    requirements: [],
    hints: [],

    panelType: StepPanelType.RIGHT_POPUP,
    textContent: "...",
};

export default Vue.extend({
    name: "LessonTestModeDlg",

    components: {ModalDlg},

    props: {
        dlgId: String,
    },

    data: function() {
        return {
            cardGreen: "#9bfb9b",
            cardRed: "#fb9b9b",

            // Variables below handle having the component refresh every second
            refreshTick: 0, // used to update the display
            refreshTimer: null as number | null, // prevents multiple timeouts at once
        };
    },

    computed: {
        ...mapStores(useStore),

        scssVars() {
            // just to be able to use in template
            return scssVars;
        },

        // Check whether refreshing is needed via the presence of 'dynamic' requirement types
        checkRefreshNeeded(): boolean {
            // Refreshing is only for dynamically updating some requirements in real time.
            // However, only a few types can actually change status without manual input from the user, which is blocked by the modal itself.
            const dynamicRequirementTypes = [
                StepRequirementType.TIME_PASSED,    // timer still runs with modal open.
                StepRequirementType.CONSOLE_OUTPUT, // in case the user runs their code before opening the modal, and a console output is fulfilled.
            ];

            return dynamicRequirementTypes.some((t) => stepHasRequirement(this.appStore.getCurrentStepAttributes, t));
        },

        // Loads the information of the currently selected step from the store
        stepDetails(): LessonStepDetails {
            // Component should only be displayed when there is valid step information in the store (handled in App.vue)
            return this.appStore.getCurrentStepAttributes ?? errorLessonStepDisplay;
        },

        // Source Code Card
        getStepSourceCode(): string[] {
            if(!this.appStore.getCurrentLesson || !this.appStore.getCurrentStepAttributes) {
                return ["Error fetching source text."];
            }
            const buildReturn = [];
            for(let i = (this.appStore.getCurrentStepAttributes.sourceLineNum ?? 1) - 1; i < this.appStore.getCurrentLesson.sourceLines.length; i++) {
                // Add lines to the returned list until </step> is read
                buildReturn.push(this.appStore.getCurrentLesson.sourceLines[i]);
                if(this.appStore.getCurrentLesson.sourceLines[i].includes("</step")) {
                    break;
                }
            }

            return buildReturn;
        },
    },

    methods: {
        // Handling refreshing the page every second for timers
        startRefreshTick() {
            this.refreshTick++; // initial update

            if (this.refreshTimer) {
                return;
            }

            if (!this.checkRefreshNeeded) { // do not continue the timer if it is not needed
                return;
            }

            this.refreshTimer = window.setInterval(() => {
                this.refreshTick++;
            }, 1000);
        },

        stopRefreshTick() {
            if (!this.refreshTimer) {
                return;
            }

            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
            this.refreshTick = 0;
        },

        // Requirement cards
        getRequirementStatusDetails(req: LessonRequirement): string {
            return requirementStatusString(req).detailsText;
        },

        getRequirementStatusProgressString(req: LessonRequirement): string {
            return requirementStatusString(req).progressText;
        },

        getRequirementStatusCardColour(req: LessonRequirement): string {
            return requirementStatusString(req).status ? this.cardGreen : this.cardRed;
        },

        // Hint cards
        getHintHeaderText(hint: LessonHint): string {
            // Add text shortening code here if its needed
            return hint.message ?? "Error loading Hint text.";
        },

        getHintStatusCardColour(hint: LessonHint): string { 
            if(hint.requirements.length == 0) {
                // Hint is automatically fulfilled when there are no requirements
                return this.cardGreen;
            }
            return getIncompleteRequirements(hint.requirements).length == 0 ? this.cardGreen : this.cardRed;
        },
    },
});

</script>

<style scoped lang="scss">

.test-mode-dlg > .modal-md {
    width: auto; 
    min-width: min(800px, 80vw);
}


.test-mode-main-wrapper {
    height: 600px;
    overflow-y: auto; // scrolling when too much content
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
}

.test-mode-section {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    border-radius: 8px;
    padding: 10px;
}

.test-mode-section-title {
    font-weight: bold;
    font-size: 20px; 
    margin-bottom: 6px;
}

.test-mode-section-body {
    flex-grow: 1; // variable sizing
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.test-mode-info-text { // text that is usually shown when there is no content to be displayed in a section
    font-style: italic;
    font-size: 14px;
    color: gray;
}

.test-mode-status-card {
    border-radius: 10px;
    display: flex;
    flex-direction: column;
    overflow: hidden; // for rounded corners
    border: 1px solid black;
}

.test-mode-status-card-line-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    font-size: 16px;
}

.test-mode-status-card-line-extra { // display for smaller requirements inside hints
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 5px 12px;
    font-size: 12px;
    border-top: 1px solid black;
}

.test-mode-status-card-details-text {
    flex: 1;
}

.test-mode-status-card-progress-text {
    flex-shrink: 0;
    opacity: 0.6;
    font-weight: bold;
    font-variant-numeric: tabular-nums;
}

.test-mode-markup-text-display {
  font-family: monospace;
  white-space: pre-wrap;
}

.source-text-alt-line {
  background-color: #f5f5f5;
}

</style>