<!-- Small component for a single page, only its own component because its used in two different components that both have a lot of other content -->
<!-- Used by CreateNewLessonDlg and OpenLessonDlg -->

<template>
    <div :style="{display: 'flex', flexDirection: 'column', height: '100%', width: '100%'}">
        <div class="lesson-details-preview-title">
            {{ lessonParseResult ? lessonParseResult.details.title : "Unnamed Lesson"}}
        </div>
        <!-- Display of the data points -->
        <div :style="{display: 'flex', gap: '6px', paddingLeft: '10px'}">
            <div
                v-for="(point, j) in getMetadataPoints(lessonParseResult.details)"
                :key="j"
                class="lesson-details-preview-pill-info"
                :style="{ fontSize: '14px', backgroundColor: point.bgColour, borderColor: point.borderColour }"
            >
                {{ point.content }}
            </div>
        </div>
        <div class="lesson-details-preview-main-message">
            {{ lessonParseResult ? lessonParseResult.details.description : "No description provided."}}
            <br><br>
            <!-- Extra description section explaining the usage of Initial Python Files -->
            <div v-if="lessonParseResult && lessonParseResult.details.initialFileType">
                This Lesson has an Initial Python File which will be uploaded to your editor upon starting the Lesson.
                <br><br>
            </div>
            Select 'Run Lesson' to begin.
        </div>
        <div class="lesson-details-preview-warning-box" v-if="getWarningCount > 0">
            The Lesson File returned {{ getWarningCount > 1 ? getWarningCount + " warnings" : "a warning" }} whilst being parsed.
            Please confirm with the provider of this Lesson File that this is expected, as it could cause unintended behaviour during the Lesson.
        </div>
    </div>
</template>
<script lang="ts">

import Vue from "vue";
import { useStore } from "@/store/store";
import { mapStores } from "pinia";
import { LessonMetadata, LessonParseResult } from "@/types/types";
import { getMetadataPointsList } from "@/helpers/lessonMetadataPoints";

export default Vue.extend({
    name: "LessonDetailsPreview",
    
    props: {
        dlgId: String,
        lesson: {
            type: Object,
            required: true,
        },
    },

    data: function() {
        return {
            lessonParseResult: this.lesson as LessonParseResult,
        };
    },

    computed: {
        ...mapStores(useStore), // Need store for accessing previously loaded lessons and storing them

        getWarningCount(): number {
            if(!this.lessonParseResult) {
                return 0;
            }
            return this.lessonParseResult.debugMessages.filter((m) => m.messageType == "warning").length;
        },
    },

    methods: {       
        getMetadataPoints(lesson: LessonMetadata) {
            return getMetadataPointsList(lesson);
        },
    },
});
</script>
<style lang="scss">

.lesson-details-preview-main-message {
    padding: 10px;
    font-size: 17px; 
}

.lesson-details-preview-title {
    padding: 10px;
    font-size: 25px; 
    font-weight: bold;
}

.lesson-details-preview-pill-info { //displayed container is pill shaped
    padding: 1px 5px;
    border-radius: 999px; //makes pill shape
    font-size: 11px;
    font-weight: bold;
    white-space: nowrap;
    background: #ececec; //default white, but some individual pills will override the colour
    color: #2c3e50;
    border: 2px solid #a1a1a1; //default gray, but some individual pills will override the colour
    display: inline-flex;
    align-items: center;
}

.lesson-details-preview-warning-box {
    width: 100%;
    padding: 12px 14px;
    background-color: #fff4e5;
    border: 1px solid #f5c27a;
    color: #8a4b00;
    border-radius: 8px;
    box-sizing: border-box;
    word-wrap: break-word;
    margin-top: auto; //move to bottom
}

</style>
