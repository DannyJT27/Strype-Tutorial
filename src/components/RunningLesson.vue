<template>
    <!-- The design has very obvious colour difference when in test mode to help educators see who is using it to cheat -->
    <div style="display: flex; flex-direction: column;">
        <div class="running-lesson-details-base" :style="{height: basePaneHeight + 'vh', background: lessonInTestMode ? 'linear-gradient(#dfcfaf, #ebbe88)' : 'linear-gradient(#a8caaa, #c2e5c5)'}">
            <button 
                class="running-lesson-details-button running-lesson-details-button-info" 
                @mouseenter="displayExtraDetails = true; setCommandsHeight(100 - (basePaneHeight + extraPaneHeight)); updateTimeDisplay();"
                @mouseleave="displayExtraDetails = false; setCommandsHeight(100 - basePaneHeight);"
            >
                i
            </button>

            <div class="running-lesson-details-title" :style="{color: lessonInTestMode ? '#feb87d' : '#74c055'}" v-if="paneWidth > 20 || (paneWidth > 25 && lessonInTestMode)">
                {{lessonInTestMode ? 'Testing Lesson' : 'Lesson in progress'}}
            </div>

            <div class="running-lesson-details-progress-wrapper" v-if="paneWidth > 15 || (paneWidth > 20 && lessonInTestMode)">
                <div class="running-lesson-details-progress-number">
                    {{ lessonProgress }}%
                </div>
                <div class="running-lesson-details-progress-bar">
                    <!-- Small line for a mini progress bar -->
                    <div class="running-lesson-details-progress-bar-fill" :style="{ width: lessonProgress + '%' , background: lessonInTestMode ? '#ec931d' : '#52b955'}"/>
                </div>
            </div>

            <button 
                v-if="lessonInTestMode && paneWidth > 15" 
                style="margin-left: auto; color: #998800; font-weight: bold;" 
                class="running-lesson-details-button running-lesson-details-button-click"
                @click="clickOpenEditor"
            >
                Open Editor
            </button>

            <button 
                style="color: #884400; font-weight: bold;" 
                :style="{marginLeft: lessonInTestMode && paneWidth > 15 ? '' : 'auto'}" 
                class="running-lesson-details-button running-lesson-details-button-click"
                @click="clickStopLesson"
            >
                Stop Lesson
            </button>
            <ModalDlg :dlgId="cancelLessonConfirmDlgId" :autoFocusButton="'ok'" :okCustomTitle="'Stop Lesson'">
                <div>
                    <span style="display: block;">
                        Are you sure you want to stop this Lesson? You will keep your Python code, but all progress through the Lesson will be lost.
                    </span>
                </div>
            </ModalDlg>      
        </div>
        <div 
            v-if="displayExtraDetails" 
            class="running-lesson-extended-base" 
            :style="{height: extraPaneHeight + 'vh', background: lessonInTestMode ? '#e3d8c3' : '#b9c9ba'}"
        >
            <div class="running-lesson-extended-text">
                Current Lesson: {{ getLessonDetails ? getLessonDetails.details.title : '?'}}
            </div>
            <div class="running-lesson-extended-text" style="margin-top: auto;">
                Lesson active for {{ timeDisplay }} minute{{ timeDisplay==1 ? '' : 's' }} (began {{ getStartTime }})
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
import scssVars from "@/assets/style/_export.module.scss";
import ModalDlg from "./ModalDlg.vue";
import { BvModalEvent } from "bootstrap-vue";
import { stopCurrentLesson } from "@/helpers/runningLessonHandler";
import { Lesson } from "@/types/types";

//////////////////////
//     Component    //
//////////////////////

export default Vue.extend({
    name: "RunningLesson",

    components: {
        ModalDlg,
    },

    props: {
        paneWidth: Number, // used to detect when to hide elements that are being squished
    },

    data: function() {
        return {
            // height values measured in vh
            basePaneHeight: 4,
            extraPaneHeight: 8,
            displayExtraDetails: false,
            timeDisplay: 0,
        };
    },

    mounted() {
        // Assumes only modal being used by this component is the Stop Lesson Confirmation
        this.$root.$on("bv::modal::hide", this.confirmStopLesson);      
    },

    computed: {
        scssVars() {
            // just to be able to use in template
            return scssVars;
        },

        cancelLessonConfirmDlgId() {
            return "cancel-lesson-confirmation-dlg";
        },

        lessonProgress(): number {
            if(useStore().lessonCompleted) {
                return 100;
            }
            return Math.round(100 * useStore().getUnlockedLessonStepIndex / useStore().getTotalLessonSteps);
        },

        lessonInTestMode(): boolean {
            return useStore().getLessonInTestMode ?? false;
        },

        getLessonDetails(): Lesson | null {
            return useStore().getCurrentLesson ?? null;
        },

        getStartTime(): string {
            return new Date(useStore().getTimeLessonStarted).toLocaleTimeString();
        },
    },

    methods: {
        clickOpenEditor() {
            this.$root.$emit("bv::show::modal", "create-new-strype-lesson-modal-dlg"); // will need to be synced with Menu.vue in the future
        },

        clickStopLesson() {
            this.$root.$emit("bv::show::modal", this.cancelLessonConfirmDlgId);
        },

        confirmStopLesson(event: BvModalEvent, dlgId: string) {
            if(dlgId == this.cancelLessonConfirmDlgId){
                if(event.trigger == "ok"){
                    // Only stop lesson if they confirmed it
                    stopCurrentLesson();
                }
            }
        },

        setCommandsHeight(newVal: number) {
            this.$emit("changeCommandsHeight", newVal);
        },

        updateTimeDisplay() {
            this.timeDisplay = Math.floor((Date.now() - useStore().getTimeLessonStarted) / 60000);
        },
    },
});
</script>

<style scoped lang="scss">

.running-lesson-details-base {
    flex-shrink: 0;
    display: flex;
    flex-direction: row;
    border-left: 1px solid black;
    border-bottom: 1px solid black;
    align-items: center;
    padding: 10px;
    gap: 5px;
}

.running-lesson-details-title {
    font-size: 14px;
    font-weight: bold;
    font-style: italic;
    text-shadow: 1px 1px 0 black;
    padding-right: 10px;
}

.running-lesson-details-progress-wrapper {
    flex: 1;
    max-width: 180px;
    display: flex; 
    flex-direction: column; 
    align-items: center; 
    padding-bottom: 8px; // centres the bar more
}

.running-lesson-details-progress-number {
    font-size: 12px;
    color: rgb(0, 0, 0);
}

.running-lesson-details-progress-bar {
    height: 8px;
    width: 100%;
    background-color: #858585; 
    border-radius: 999px; //round
}

.running-lesson-details-progress-bar-fill {
    height: 100%;
    border-radius: 999px; //round
    transition: width 0.3s ease; // ease transition on width change
}

// same as buttons in LessonStepPanel
.running-lesson-details-button {
    all: unset; //remove browser defaults for consistency across browsers
    border: 2px solid #414141;
    background: #e9e9e9;
    color: black;
    font-size: 14px;
    height: 18px;
    border-radius: 999px; //makes button round
    display: flex;
    justify-content: center;
    align-items: center;
}

.running-lesson-details-button:hover {
    background: #cfcfcf;
}

.running-lesson-details-button-info {
    cursor: help;
    width: 18px;
    padding-top: 0px; //better centering
}

.running-lesson-details-button-click {
    cursor: pointer;
    padding-left: 6px;
    padding-right: 6px;
}

.running-lesson-extended-base {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    border-left: 1px solid black;
    border-bottom: 1px solid black;
    padding: 10px;
    gap: 5px;
}

.running-lesson-extended-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
    font-size: 16px;
}


</style>