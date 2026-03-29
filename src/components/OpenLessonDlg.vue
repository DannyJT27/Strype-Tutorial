<!-- Most of this component is re-used code from OpenDemoDlg.vue, mainly for design consistency -->

<template>
    <ModalDlg
            :dlgId="dlgId"
            :dlg-title="getPageTitle"
            :autoFocusButton="'ok'"
            showCloseBtn
            css-class="open-lesson-dlg"
        >
        <!-- Override of the footer content to add custom buttons, unique to each page. Buttons before/with 'mr-auto' are fixed to the left -->
        <template #modal-footer-content="{ cancel }">
            <template v-if="modalPage === 'list'">
                <b-button variant="success" @click="cancel()"> <!-- TBC -->
                    Create a Lesson
                </b-button>
                <b-button variant="warning" class="mr-auto" :disabled="uploadedLessonsCount === 0" @click="modalPage = 'edit'; selectedLessonIndex = 0">
                    Edit Uploaded Lessons
                </b-button>
                <b-button variant="secondary" @click="cancel()">
                    Cancel
                </b-button>
                <b-button variant="primary" @click="clickContinue()">
                    Continue
                </b-button>
            </template>
            <template v-else-if="modalPage === 'edit'">
                <b-button variant="secondary" @click="modalPage = 'list'; selectedLessonIndex = -1">
                    Done
                </b-button>
                <b-button variant="danger" @click="clickDelete()">
                    Delete Lesson
                </b-button>
            </template>
            <template v-else-if="modalPage === 'parsing'">
                <b-button variant="secondary" @click="modalPage = 'list'">
                    Back
                </b-button>
                <b-button variant="primary" disabled> <!-- Present but disabled, keeps layout consistent -->
                    Continue
                </b-button>
            </template>
            <template v-else-if="modalPage === 'error'">
                <b-button variant="danger" class="mr-auto" @click="clickDelete()">
                    Delete Lesson
                </b-button>
                <b-button variant="secondary" @click="modalPage = 'list'">
                    Back
                </b-button>
                <b-button variant="primary" disabled> <!-- Present but disabled, keeps layout consistent -->
                    Continue
                </b-button>
            </template>
            <template v-else-if="modalPage === 'runLesson'">
                <b-button variant="secondary" @click="modalPage = 'list'">
                    Back
                </b-button>
                <b-button :variant="lessonParseResult && lessonParseResult.details.initialFileName ? 'primary' : 'success'" @click="clickRun()">
                    {{ lessonParseResult && lessonParseResult.details.initialFileName ? "Upload Project File" : "Run Lesson" }}
                </b-button>
            </template>
        </template>

        <div class="d-flex" style="height: 400px;">
            <!-- THIS MODAL HAS MULTIPLE PAGES, CONTROLLED USING v-if -->
            
            <!-- PAGE 'list' (and 'edit') - A display of all uploaded lessons and the option to upload new ones -->
            <!-- PAGE 'edit' is a variant of list that is used to deleted uploaded lessons, only displaying those that can be deleted -->
            <div class="flex-grow-1 p-3 overflow-auto" v-if="modalPage === 'list' || modalPage === 'edit'">
                <div class="d-flex flex-column">
                    <!-- Upload new button, uses i = -1 -->
                    <button
                        v-if="modalPage === 'list'"
                        :class="{'d-flex': true, 'open-lesson-dlg-lesson-item': true, 'open-lesson-dlg-selected-lesson-item': selectedLessonIndex === -1}"
                        type="button"
                        @click="selectedLessonIndex = -1"
                        @dblclick="clickContinue"
                        @keydown.space.self="selectedLessonIndex = -1"
                    >
                        <!-- Split into left segement for text and right segment for upload image -->
                        <div class="open-lesson-dlg-split-button-main">
                            <span class="open-lesson-dlg-name">
                                <i>Upload new Lesson...</i>
                            </span>
                            <span class="open-lesson-dlg-description">
                                <i>Choose a provided Lesson File to upload and run.</i>
                            </span>
                        </div>

                        <div class="open-lesson-dlg-split-button-upload">
                            <img src="@/assets/images/upload-icon.png">
                        </div>
                    </button>
                    <!-- Existing lessons -->
                    <button
                        v-for="(item, i) in (modalPage === 'list' ? lessonsStored : lessonsStored.slice(0, uploadedLessonsCount))"
                        :key="i"
                        :class="{'d-flex': true, 'open-lesson-dlg-lesson-item': true, 'open-lesson-dlg-selected-lesson-item': selectedLessonIndex === i}"
                        type="button"
                        @click="selectedLessonIndex = i"
                        @dblclick="clickContinue"
                        @keydown.space.self="selectedLessonIndex = i"
                    >
                        <!-- Split into left segement for text and right segment for data points -->
                        <div class="open-lesson-dlg-split-button-main">
                            <span class="open-lesson-dlg-name">
                                {{item.details.title}}
                            </span>
                            <span class="open-lesson-dlg-description">
                                {{item.details.description}} <!-- v-html is unsafe for unsanitized user input -->
                            </span> 
                        </div>

                        <div class="open-lesson-dlg-split-button-lesson-data">
                            <!-- .slice(0, 4) is used below to limit 4 display points on this page -->
                            <div
                                v-for="(point, j) in getMetadataPointsList(item.details).slice(0, 4)"
                                :key="j"
                                class="open-lesson-dlg-pill-info"
                                :style="{ backgroundColor: point.bgColour, borderColor: point.borderColour, opacity: selectedLessonIndex === i ? 0.8 : 1 }"
                            >
                                {{ point.content }}
                            </div>
                        </div>
                    </button>
                </div>
            </div>

            <!-- PAGE 'parsing' - A small, brief loading message whilst a lesson file is being parsed -->
            <div class="open-lesson-dlg-parsing-message" v-if="modalPage === 'parsing'">
                Loading Lesson...
                <br><br>
                If this takes more than a few seconds, try refreshing the page.
            </div>

            <!-- PAGE 'error' - Shows the errors returned from the parsing -->
            <div class="open-lesson-dlg-main-message" v-if="modalPage === 'error'">
                The selected Lesson File <i>'{{ lessonParseResult ? lessonParseResult.details.title : "Unnamed Lesson"}}'</i> returned errors upon being loaded. 
                This Lesson cannot be run, and should be deleted from your loaded Lessons.
                <br><br>
                If this is not expected, <b>ensure that you have uploaded the right file.</b> 
                If you need to view the errors present in the file, upload it to the 'Create a Lesson' section.
            </div>

            <!-- PAGE 'runLesson' - Displays a summary of the loaded lesson with some extra details if necessary -->
            <div v-if="modalPage === 'runLesson'" :style="{display: 'flex', flexDirection: 'column', height: '100%', width: '100%'}">
                <div class="open-lesson-dlg-title">
                    {{ lessonParseResult ? lessonParseResult.details.title : "Unnamed Lesson"}}
                </div>
                <!-- Another display of the data points -->
                <div :style="{display: 'flex', gap: '6px', paddingLeft: '10px'}">
                    <div
                        v-for="(point, j) in getMetadataPointsList(lessonParseResult ? lessonParseResult.details : getErrorLoadingLesson.details)"
                        :key="j"
                        class="open-lesson-dlg-pill-info"
                        :style="{ fontSize: '14px', backgroundColor: point.bgColour, borderColor: point.borderColour }"
                    >
                        {{ point.content }}
                    </div>
                </div>
                <div class="open-lesson-dlg-main-message">
                    {{ lessonParseResult ? lessonParseResult.details.description : "No description provided."}}
                    <br><br>
                    <!-- Extra description section explaining the usage of Initial Python Files -->
                    <div v-if="lessonParseResult && lessonParseResult.details.initialFileName">
                        This Lesson expects an initial Strype Python File '<b>{{lessonParseResult.details.initialFileName}}</b>' to be provided.
                        You will be prompted to upload this file upon continuing, and the Lesson will begin after the file is successfully loaded.
                        <br><br>
                        Select 'Upload Project File' to begin.
                    </div>
                    <div v-else>
                        Select 'Run Lesson' to begin.
                    </div>
                </div>
                <div class="open-lesson-dlg-warning-box" v-if="lessonParseResult && lessonParseResult.warnings.length > 0">
                    The Lesson File returned {{ lessonParseResult.warnings.length > 1 ? lessonParseResult.warnings.length + " warnings" : "a warning" }} whilst being parsed.
                    Please confirm with the provider of this Lesson File that this is expected, as it could cause unintended behaviour during the Lesson.
                </div>
            </div>
            
        </div>
    </ModalDlg>    
</template>
<script lang="ts">

import Vue from "vue";
import { useStore } from "@/store/store";
import { mapStores } from "pinia";
import ModalDlg from "@/components/ModalDlg.vue";
import { getExampleLessons } from "@/helpers/exampleLessons";
import { Lesson, LessonMetadata, LessonParseResult } from "@/types/types";
import { parseFullLessonFile } from "@/helpers/lessonFileParser";
import { startLesson } from "@/helpers/runningLessonHandler";

// Info to display when lessonParseResult happens to be null
const errorLoadingLesson: Lesson = {
    sourceLines: [],
    details: {
        title: "Error",
        description: "There was an error loading this lesson, refer to the console for more information",
        totalSteps: 0,
    },
};

type MetadataPoint = {
    content: string;
    borderColour?: string;
    bgColour?: string;
};

export default Vue.extend({
    components: {ModalDlg},
    
    props: {
        dlgId: String,
    },
    
    data: function() {
        return {
            modalPage: "list", // This modal has multiple 'pages' to display, dictated by this value
            // list - List of lessons to choose from, as well as the option to open 'Test Lesson File' and the option to upload a new lesson.
            // edit - List of uploaded lesson to be able to delete them.
            // parsing - Brief loading screen, plus error display for when an invalid file is uploaded.
            // error - The uploaded/loaded lesson file has errors which prevent it from being run. As this is the student's experience, there is no option to fix them.
            // runLesson - The uploaded/loaded lesson file is ready to run. Just displays some confirming info to the student before they start it.

            lessonParseResult: null as LessonParseResult | null, // Temporary store of the parseResult returned by lessonFileParser.ts

            lessonsStored: [] as Lesson[],
            selectedLessonIndex: -1, // Start on 'Upload new Lesson...' selected (-1)
        };
    },

    computed: {
        ...mapStores(useStore), // Need store for accessing previously loaded lessons and storing them

        getPageTitle(): string {
            const pageTitleMap: Record<string, string> = {
                "list": "Choose a Lesson to load",
                "edit": "Select an uploaded Lesson to delete it",
                "parsing": "Choose a Lesson to load",
                "error": "Lesson File Error",
                "runLesson": "Lesson File successfully loaded",
            };
            return pageTitleMap[this.modalPage];
        },

        getErrorLoadingLesson(): Lesson {
            return errorLoadingLesson;
        },

        uploadedLessonsCount(): number {
            return this.appStore.getAllLoadedLessons.length;
        },
    },

    methods: {       
        async updateAvailableLessons() {
            // Lessons come from two sources:
            // - Existing example lessons stored in this public/lessons/
            // - Uploaded lessons cached in appStore
            // Only the second option should change occasionally, so this method ensures that the display is up to date.

            this.lessonsStored = await getExampleLessons(); // Add the example lessons first
            this.lessonsStored = this.lessonsStored.concat(this.appStore.getAllLoadedLessons); // Then add the stored lessons

            // Reversing the array allows the lessons to be displayed in order of being recently uploaded, since the user is most likely going to want to access more recently uploaded lessons.
            // Also puts example lessons at the bottom, as users will likely not want to access them after uploading their own.
            this.lessonsStored.reverse();
        },

        getMetadataPointsList(lessonDetails: LessonMetadata): MetadataPoint[] {
            // Stored as [borderColour, bgColour]
            const pillColourSchemes: Record<string, [string, string]> = {
                "red": ["#ff364d", "#ff928a"],
                "dark-red": ["#a61f2f", "#eb867f"],
                "orange": ["#faa22f", "#fcbb74"],
                "yellow": ["#f0fa34", "#f7fc95"],
                "green": ["#3afa2f", "#aafaa7"],
                //Blue colours should be avoided due to the selection colour being blue
            };

            // Start with totalSteps as this will always be present
            const allPoints = [{
                content: lessonDetails.totalSteps + " Steps",
            }] as MetadataPoint[];

            if(lessonDetails.estimatedTime) {
                allPoints.push({
                    content: "~" + lessonDetails.estimatedTime + " minutes",
                });
            }

            // Maps difficulty string to [display word, [borderColour, bgColour]]
            const difficultyPointMap: Record<string, [string, [string, string]]> = {
                "easy": ["Easy", pillColourSchemes["green"]],
                "beginner": ["Beginner", pillColourSchemes["green"]],
                "medium": ["Medium", pillColourSchemes["orange"]],
                "intermediate": ["Intermediate", pillColourSchemes["orange"]],
                "hard": ["Hard", pillColourSchemes["red"]],
                "advanced": ["Advanced", pillColourSchemes["red"]],
                "extreme": ["Extreme", pillColourSchemes["dark-red"]],
                "1-star": ["☆☆☆☆★", pillColourSchemes["green"]],
                "2-star": ["☆☆☆★★", pillColourSchemes["yellow"]],
                "3-star": ["☆☆★★★", pillColourSchemes["orange"]],
                "4-star": ["☆★★★★", pillColourSchemes["red"]],
                "5-star": ["★★★★★", pillColourSchemes["dark-red"]],
            };

            if(lessonDetails.difficulty) {
                allPoints.push({
                    content: difficultyPointMap[lessonDetails.difficulty][0],
                    borderColour: difficultyPointMap[lessonDetails.difficulty][1][0],
                    bgColour: difficultyPointMap[lessonDetails.difficulty][1][1],
                });
            }

            return allPoints;
        },

        clickContinue() {
            // Method to handle clicking the 'Continue' button. Since there are multiple different 'pages' on this modal, the usual OK function can't be used
            // The specific action that is taken will depend on a) the current page, and b) the selected lesson file

            if(this.modalPage == "list") {
                // The list page is the displayed list of available lesson files to run, as well as the option to upload a new lesson file
                if(this.selectedLessonIndex == -1) {
                    // -1 is the designated index for the Upload selection

                    //TBC
                }
                else {
                    // Any other index implies an already uploaded Lesson was selected
                    this.modalPage = "parsing"; // Instantly display a loading screen, which will persist until the lesson is parsed. Should only last a few milliseconds.

                    this.lessonParseResult = parseFullLessonFile(this.lessonsStored[this.selectedLessonIndex].sourceLines);

                    // With the parse result stored, set the page to either 'error' or 'lesson', depending on the presence of errors.
                    // Does not use the .success boolean just yet, as this only determines whether the file was fully parsed, which can still have some errors present.
                    this.modalPage = this.lessonParseResult.ERRORS.length == 0 ? "runLesson" : "error";
                }
            }
            else if(this.modalPage == "edit") {
                // Important that nothing is done here. Buttons on the edit page can be double clicked to trigger this method. We do not want that to delete it.
            }
        },

        clickDelete() {
            // This delete function is available on the 'edit' page, and the 'error' page for instantly deleting a lesson file that has returned an error.
            // In theory, this page should only be reached from uploaded lesson files. Built in example lesson files should not be producing errors...

            // The index to delete is calculated based on the logic inside updateAvailableLessons()
            // The store list is concatted to the end of the local list, and then the local list is reversed. 
            // Based on this logic, the final element of the store list [getLoadedLessonsLength - 1] is at the start of the local list [0].
            this.appStore.deleteLoadedLesson(this.appStore.getLoadedLessonsLength - (1 + this.selectedLessonIndex));
            this.lessonsStored.splice(this.selectedLessonIndex, 1); // Also delete locally so that it doesn't need to run update again

            if(this.modalPage == "error") {
                this.modalPage = "list"; // Go back to list page (only if on error page)
            }
        },

        clickRun() {
            //TBC UPLOADING INITIAL FILE
            if(this.lessonParseResult) {
                startLesson(this.lessonParseResult, this.lessonsStored[this.selectedLessonIndex].sourceLines);
            }
            window.setTimeout(() => {
                this.modalPage = "list"; // Go back to list page with a brief delay so that it happens after the modal is hidden
            }, 500);
            this.$root.$emit("bv::hide::modal", this.dlgId); // Hide the modal
        },
    },
});
</script>
<style lang="scss">

.open-lesson-dlg > .modal-md {
    width: auto; /* important to let content control size */
    min-width: min(800px, 80vw);
}

.open-lesson-dlg-lesson-item {
    padding: 10px 20px 10px 20px;
    background-color: white;
    border: 2px;
    text-align: left;
    height: 130px;
}

.open-lesson-dlg-lesson-item:hover {
    background-color: #f8f9fa;
}

.open-lesson-dlg-selected-lesson-item, .open-lesson-dlg-selected-lesson-item:hover {
    background-color: #007bff;
}

.open-lesson-dlg-split-button-main {
    width: 80%;
    display: flex;
    flex-direction: column;
}

.open-lesson-dlg-split-button-upload {
    width: 20%;
    display: flex;
    justify-content: center;
    align-items: center;
}

.open-lesson-dlg-split-button-upload img {
    max-width: 80px;
    max-height: 80px;
    opacity: 30%;
}

.open-lesson-dlg-split-button-lesson-data {
    width: 20%;
    display: flex;
    align-items: flex-end;
    flex-direction: column;
    gap: 4px;
    padding-top: 2px;
}

span.open-lesson-dlg-name {
    font-weight: bold;
    font-size: 125%;
}

.open-lesson-dlg-selected-lesson-item span.open-lesson-dlg-name {
    color: white;
}

span.lesson-demo-dlg-description {
    color: #777;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-box-orient: vertical;
}

.open-lesson-dlg-selected-lesson-item span.open-lesson-dlg-description {
    color: #eee;
}

.open-lesson-dlg-selected-lesson-item span.open-lesson-dlg-description a {
    color: white;
}

.open-lesson-dlg-parsing-message {
    display: flex;
    justify-content: center;
    align-items: center;
    text-align: center;
    color: gray;
    font-size: 18px;
    height: 100%;
    width: 100%;
    font-style: italic;
}

.open-lesson-dlg-main-message {
    padding: 10px;
    font-size: 17px; 
}

.open-lesson-dlg-title {
    padding: 10px;
    font-size: 25px; 
    font-weight: bold;
}

.open-lesson-dlg-pill-info { //displayed container is pill shaped
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

.open-lesson-dlg-warning-box {
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
