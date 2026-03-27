<!-- Most of this component is re-used code from OpenDemoDlg.vue, mainly for design consistency -->

<template>
    <ModalDlg
            :dlgId="dlgId"
            :dlg-title="$t('lessons.dialogTitle')"
            showCloseBtn
            :autoFocusButton="'ok'"
            css-class="open-lesson-dlg"
            :ok-disabled="!(true)" 
            :ok-title="$t('lessons.continue')"> <!-- TBC CONDITION FOR OK-DISABLED ALSO OK-TITLE ISNT WORKING FOR SOME REASON -->
        <div class="d-flex" style="height: 400px;">
            <!-- List Group -->
            <div class="flex-grow-1 p-3 overflow-auto">
                <div class="d-flex flex-column">
                    <!-- Upload new button, uses i = -1 -->
                    <button
                        :class="{'d-flex': true, 'open-lesson-dlg-lesson-item': true, 'open-lesson-dlg-selected-lesson-item': selectedLessonIndex === -1}"
                        type="button"
                        @click="selectedLessonIndex = -1"
                        @dblclick="onDblClick"
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
                        v-for="(item, i) in lessonsStored"
                        :key="i"
                        :class="{'d-flex': true, 'open-lesson-dlg-lesson-item': true, 'open-lesson-dlg-selected-lesson-item': selectedLessonIndex === i}"
                        type="button"
                        @click="selectedLessonIndex = i"
                        @dblclick="onDblClick"
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
                            {{item.details.totalSteps}} Steps
                            <!-- TBC MORE METADATA DISPLAY (difficulty, est. time)-->
                        </div>
                    </button>
                </div>
            </div>
        </div>
    </ModalDlg>    
</template>
<script lang="ts">

import Vue from "vue";
import { useStore } from "@/store/store";
import { mapStores } from "pinia";
import MenuComponent from "@/components/Menu.vue";
import ModalDlg from "@/components/ModalDlg.vue";
import { getExampleLessons } from "@/helpers/exampleLessons";
import { Lesson } from "@/types/types";
import { BvModalEvent } from "bootstrap-vue";
import { getMenuLeftPaneUID } from "@/helpers/editor";

export default Vue.extend({
    components: {ModalDlg},
    
    props: {
        dlgId: String,
    },
    
    data: function() {
        return {
            modalPageNum: "list", // This modal has multiple 'pages' to display, dictated by this value
            // list - List of lessons to choose from, as well as the option to open 'Test Lesson File' and the option to upload a new lesson
            // parsing - Brief loading screen, plus error display for when an invalid file is uploaded
            // debug - Display of debug messages

            lessonsStored: [] as Lesson[],
            selectedLessonIndex: -1, // Start on 'Upload new Lesson...' selected (-1)
        };
    },

    computed: {
        ...mapStores(useStore), // Need store for accessing previously loaded lessons and storing them
    },

    methods: {       
        async updateAvailableLessons() {
            // Lessons come from two sources:
            // - Existing example lessons stored in this public/lessons/
            // - Uploaded lessons cached in appStore
            // Only the second option should change occasionally, so this method ensures that the display is up to date.

            this.lessonsStored = await getExampleLessons(); // Add the example lessons first
            this.lessonsStored.concat(this.appStore.getLoadedLessons); // Then add the stored lessons

            // Reversing the array allows the lessons to be displayed in order of being recently uploaded, since the user is most likely going to want to access more recently uploaded lessons.
            // Also puts example lessons at the bottom, as users will likely not want to access them when uploading their own.
            this.lessonsStored.reverse();

            this.modalPageNum = "list"; // Go back to list page, although there shouldn't really be a case where its not already on the list page
        },
        
        // Called by Menu component when we are shown:
        shown() {
            //tbc maybe not even needed
        },

        /*getSelectedDemo() : ({ name : string, demoFile: Promise<string | undefined> } | undefined) {
            if (this.selectedDemoItemIndex >= 0 && this.selectedDemoItemIndex < this.demosInCurrentCategory.length) {
                const d = this.demosInCurrentCategory[this.selectedDemoItemIndex];
                return {name: d.name, demoFile: d.demoFile()};
            }
            return undefined;
        }, THIS METHOD IS FOR WHEN THE MODAL IS CLOSED AND IT NEED TO GET THE INFO FROM THE SELECTED ITEM
        */

        onDblClick(){
            // Triggers the modal's OK event to load the selected example. The click event is fired before the double-click event:
            // selectedLessonIndex is already set to the right value.
            // We first close the dialog, than simulate a "close with action" in the Menu (since we can't close with "OK" status.)  TBC CHECK IF THIS IS RIGHT
            this.$root.$emit("bv::hide::modal", this.dlgId);
            (this.$root.$children[0].$refs[getMenuLeftPaneUID()] as InstanceType<typeof MenuComponent>).onStrypeMenuHideModalDlg({trigger: "ok"} as BvModalEvent, this.dlgId);
        },
    },
});
</script>
<style>
.open-lesson-dlg > .modal-md {
  width: auto; /* important to let content control size */
  min-width: min(800px, 80vw);
}

.open-lesson-dlg-lesson-item {
  padding: 10px 20px 10px 20px;
  background-color: white;
  border: 2px;
  text-align: left;
  height: 120px;
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
    align-items: flex-start;
    justify-content: flex-end;
    gap: 6px;
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
</style>
