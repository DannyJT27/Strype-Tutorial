<template>
    <ModalDlg
        :dlgId="dlgId"
        :dlg-title="'Debug Information - ' + stepDetails.stepRef"
        showCloseBtn
        okOnly
        css-class="test-mode-dlg"
        size="lg"
    >
        <div class="test-mode-main-wrapper">
            <div class="test-mode-section" v-if="!currentStepIsLatest && (stepDetails.hints.length + stepDetails.requirements.length) > 0">
                <div class="test-mode-info-text" :style="{paddingBottom: '4px'}">
                    <b>
                        ⓘ Requirements and Hints are only computed for the most recently 'unlocked' Step. Once a Step is completed and the user progresses,
                        its Requirements and Hints expire and stopped being tracked. 
                        <br>
                        If you wish to reverse this, click 'Return to Step' to re-lock all proceeding Steps for this session.
                        You will be able to proceed as usual as if you have just reached this Step. Your Python code will not be affected.
                    </b>
                </div>
                <button class="return-to-step-button" @click="returnToStep">
                    Return to Step
                </button>
            </div>
            <!-- Split into 3 main sections -->

            <!-- Section 1: Requirements -->
            <div class="test-mode-section">
                <div class="test-mode-section-title">
                    Step Requirements
                    <span v-if="stepDetails.requirements.length > 0 && currentStepIsLatest">
                        <!-- Counter for requirements, including logic with min-requirements attribute. The total requirement counter turns gold when lowered by <min-requirements> -->
                        - {{ reqCards.filter((req) => req.status).length }} /
                        <span :style="{ color: stepDetails.attributes.minRequirements && stepDetails.requirements.length != stepDetails.attributes.minRequirements ? '#ab9700' : '' }">
                            {{ stepDetails.attributes.minRequirements || stepDetails.requirements.length }}
                            {{ disabledRequirements ? ' (Ignored in Test Mode)' : '' }}
                        </span>
                    </span>
                </div>
                <div class="test-mode-section-body">
                    <div class="test-mode-info-text" v-if="stepDetails.requirements.length == 0">
                        This Step has no Requirements.
                    </div>
                    <div 
                        v-for="(rCard, i) in reqCards"
                        :key="i"
                        class="test-mode-status-card"
                    >
                        <!-- Display card for each step requirement -->
                        <div class="test-mode-status-card-line-header" :style="{backgroundColor: statusCardColour(rCard.status)}">
                            <div class="test-mode-status-card-details-text">
                                {{ rCard.detailsText }}
                            </div>
                            <div class="test-mode-status-card-progress-text" v-if="currentStepIsLatest">
                                {{ rCard.progressText }}
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
                        v-for="(hCard, i) in hintCards"
                        :key="i"
                        class="test-mode-status-card"
                    >
                        <!-- Display card for each hint -->
                        <div class="test-mode-status-card-line-header" :style="{backgroundColor: statusCardColour(hCard.status)}">
                            <div class="test-mode-status-card-details-text">
                                "{{  hCard.hintText }}"
                            </div>
                        </div>
                        <!-- Display all requirements for the hint-->
                        <div 
                            v-for="(rCard, j) in hCard.reqs"
                            :key="j"
                            class="test-mode-status-card-line-extra"
                            :style="{backgroundColor: statusCardColour(rCard.status)}"
                        >
                            <div class="test-mode-status-card-details-text">
                                {{ rCard.detailsText }}
                            </div>
                            <div class="test-mode-status-card-progress-text" v-if="currentStepIsLatest">
                                {{ rCard.progressText }}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Section 3: Source Text -->
            <div class="test-mode-section">
                <div class="test-mode-section-title">Source Text</div>
                <!-- Extra informative message to explain text line wrapping, only showing if there is a long line -->
                <div class="test-mode-info-text" :style="{paddingBottom: '4px'}"  v-if="getStepSourceCode.some((line) => line.length > 96)">
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
        </div>
    </ModalDlg>
</template>

<script lang="ts">
//////////////////////
//      Imports     //
//////////////////////
import Vue from "vue";
import { useStore } from "@/store/store";
import { LessonStepDetails, StepPanelType } from "@/types/types";
import { requirementStatusString, DebugRequirementStatusDisplay, resetRequirementValues } from "@/helpers/lessonRequirementHandler";
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

    attributes: {panelType: StepPanelType.LEFT_POPUP},
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
            cardDull: "#fffb87",

            // Local store of card displays to prevent the requirementStatusString() method from being computed over and over
            reqCards: [] as DebugRequirementStatusDisplay[],
            hintCards: [] as {hintText: string, status: boolean, reqs: DebugRequirementStatusDisplay[]}[],
        };
    },

    computed: {
        scssVars() {
            // just to be able to use in template
            return scssVars;
        },

        // Loads the information of the currently selected step from the store
        stepDetails(): LessonStepDetails {
            // Component should only be displayed when there is valid step information in the store (handled in App.vue)
            return useStore().getCurrentStepAttributes ?? errorLessonStepDisplay;
        },

        // Source Code Card
        getStepSourceCode(): string[] {
            if(!useStore().getCurrentLesson || !useStore().getCurrentStepAttributes) {
                return ["Error fetching source text."];
            }
            const buildReturn = [];
            const currentLesson = useStore().getCurrentLesson ?? {
                details: {
                    title: "",
                    description: "",
                    totalSteps: 0,
                },
                sourceLines: [],
            };
            // For some reason it throws an error about useStore().getCurrentLesson potentially being null
            // even though this is checked at the top. The dummy information above will never be used.

            for(let i = (useStore().getCurrentStepAttributes.sourceLineNum ?? 1) - 1; i < currentLesson.sourceLines.length; i++) {
                // Add lines to the returned list until </step> is read
                buildReturn.push(currentLesson.sourceLines[i]);
                if(currentLesson.sourceLines[i].toLowerCase().includes("</step")) { // This could break if someone decided to include '</step' in a text section for some reason...
                    break;
                }
            }

            return buildReturn;
        },

        currentStepIsLatest() {
            return useStore().isCurrentStepLastUnlocked ?? false;
        },

        disabledRequirements() {
            return useStore().getLessonTestModeConfig.disableRequirements;
        },
    },

    methods: {
        // Requirement cards
        updateCards(): void {
            if(!useStore().getCurrentStepAttributes) {
                return;
            }

            // Requirement status is only needed for the most recently unlocked Step, since the values are only being tracked for that Step
            const reqsDisabled = !useStore().isCurrentStepLastUnlocked;
            const currentStep = useStore().getCurrentStepAttributes;
            this.reqCards = currentStep.requirements.map((req) => requirementStatusString(req, reqsDisabled));
            this.hintCards = currentStep.hints.map((hint) => {
                const reqs = hint.requirements.map((req) => requirementStatusString(req, reqsDisabled));
                return {
                    hintText: hint.message,
                    reqs,
                    status: reqs.every((r) => r.status), // .every holds when all reqs have status = true
                };
            });
        },

        statusCardColour(status: boolean): string {
            if(!useStore().isCurrentStepLastUnlocked) {
                // Do not show status for non-computed requirements
                return this.cardDull;
            }
            return status ? this.cardGreen : this.cardRed;
        },

        returnToStep(): void {
            // For the case where it isn't the last step unlocked, this button locks future steps to pretend that it is.
            // This allows requirements to start being tracked again
            // currentStepIndex doesn't need to change since we are already there.
            useStore().lessonLockFutureSteps();
            resetRequirementValues();
            setTimeout(() => {
                this.updateCards();
            }, 50); // Refreshes page after updates with a slight delay to account for new requirement values
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

.return-to-step-button {
    all: unset; //remove browser defaults for consistency across browsers
    border: 2px solid #000000;
    background: #ffffff;
    color: rgb(0, 0, 0);
    cursor: pointer;
    width: 140px;
    height: 30px;
    border-radius: 10px; //rounded edges without oval shape
    display: flex;
    justify-content: center;
    align-items: center;
}

.return-to-step-button:hover {
    background: #e0e0e0;
}

</style>