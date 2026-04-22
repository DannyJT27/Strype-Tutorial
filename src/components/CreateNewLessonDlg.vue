<template>
    <ModalDlg
            :dlgId="dlgId"
            :dlg-title="getPageTitle"
            :autoFocusButton="'ok'"
            showCloseBtn
            css-class="create-new-lesson-dlg"
            size="xl"
            :disable-enter-close="true"
        >
        <!-- Override of the footer content to add custom buttons, unique to each page. Buttons before/with 'mr-auto' are fixed to the left -->
        <template #modal-footer-content="{ cancel }">
            <template v-if="modalPage === 'landing'">
                <b-button variant="secondary" @click="clickBackToOpenLesson(); cancel();">
                    Back
                </b-button>
                <b-button variant="primary" @click="clickContinueLanding()">
                    Continue
                </b-button>
            </template>
            <template v-if="modalPage === 'editor'">
                <b-button :variant="showDocumentation ? 'danger' : 'info'" @click="showDocumentation = !showDocumentation"> 
                    {{showDocumentation ? 'Hide' : 'Show'}} Documentation
                </b-button>
                <b-button variant="info" :class="{'mr-auto' : !showDocumentation}" @click="clickSearchSelectedKeyword">
                    {{showDocumentation ? 'Search Selected Keyword' : 'Open Documentation (Selected Keyword)'}}
                </b-button>
                <!-- Next few elements only show for documentation -->
                 
                <input type="text" style="max-width: 140px; height: 35px;" v-if="showDocumentation" v-model="searchBarContent"/> <!-- Search bar -->

                <b-button variant="primary" v-if="showDocumentation" @click="clickSearchDocumentation" :disabled="searchBarContent.length == 0">
                    Search
                </b-button>
                <b-button variant="secondary" v-if="showDocumentation" @click="clickBackDocPage" :disabled="docBackPageStack.length == 0">
                    &lt;
                </b-button>
                <b-button variant="secondary" class="mr-auto" v-if="showDocumentation" @click="clickForwardDocPage" :disabled="docForwardPageStack.length == 0">
                    &gt;
                </b-button>
                <!-- Always show vvv -->
                <b-button variant="secondary" @click="clickBackToOpenLesson(); cancel();" :disabled="showDocumentation"> <!-- Disables when doc is open to avoid confusion -->
                    Back
                </b-button>
                <b-button variant="warning" @click="clickTestLesson()" :disabled="currentlyParsing || editorContent.length == 0">
                    Test Lesson
                </b-button>
            </template>
            <template v-if="modalPage === 'testLesson'">
                <b-button variant="secondary" @click="modalPage = 'editor'">
                    Back
                </b-button>
                <b-button variant="success" @click="clickRunLesson()">
                    Run Lesson
                </b-button>
            </template>
        </template>

        <div class="d-flex" style="height: 100%;">
            <!-- THIS MODAL HAS MULTIPLE PAGES, CONTROLLED USING v-if -->

            <!-- PAGE 'landing' - Landing page giving options for starting a new lesson file -->
            <div v-if="modalPage === 'landing'" class="create-new-lesson-dlg-landing-page">
                <div class="create-new-lesson-dlg-landing-title">
                    Choose an option below to open the editor (for Teachers only).
                </div>
                <div class="create-new-lesson-dlg-landing-button-row">
                    <div class="create-new-lesson-dlg-landing-button" :class="{'create-new-lesson-dlg-landing-button-selected' : landingSelection == 1}" @click="landingSelection = 1" @dblclick="clickContinueLanding">
                        <img src="@/assets/images/plus-icon.png" />
                        <div class="create-new-lesson-dlg-landing-button-text">Create New Lesson File</div>
                    </div>
                    <div class="create-new-lesson-dlg-landing-button" :class="{'create-new-lesson-dlg-landing-button-selected' : landingSelection == 2}" @click="landingSelection = 2" @dblclick="clickContinueLanding">
                        <img src="@/assets/images/upload-icon.png" />
                        <div class="create-new-lesson-dlg-landing-button-text">Upload Lesson File</div>
                    </div>
                    <div class="create-new-lesson-dlg-landing-button" :class="{'create-new-lesson-dlg-landing-button-selected' : landingSelection == 3}" @click="landingSelection = 3" @dblclick="clickContinueLanding">
                        <img src="@/assets/images/documentation-icon.png" />
                        <div class="create-new-lesson-dlg-landing-button-text">View Documentation</div>
                    </div>
                </div>
            </div>

            <!-- PAGE 'editor' - Main editor interface with text area, upload/download options, and parser debug message display. Also has a toggleable documentation panel -->
            <div v-if="modalPage === 'editor'" :style="{display: 'flex', flexDirection: 'row', height: '100%', width: '100%'}">
                <!-- Left side textarea -->
                <div class="create-new-lesson-dlg-editor-left" :style="{width: showDocumentation ? '40%' : '50%'}">
                    <textarea 
                        ref="textEditor" 
                        v-model="editorContent" 
                        class="create-new-lesson-dlg-editor-textarea" 
                        @keydown.tab.prevent="editorTypeTab($event)"
                        placeholder="Write your Lesson File here..."
                    />
                </div>

                <!-- Right side documentation -->
                <div v-if="showDocumentation" class="create-new-lesson-dlg-editor-right" :style="{width: '60%'}">
                    <LessonMarkupDocumentation 
                        :pageRef="docPage" 
                        style="border-radius: 10px;"
                        @go-to-documentation-page="updateDocPage"
                        @emit-scroll-pos="updateDocScrollPos"
                    />
                </div>

                <!-- Right side utility options -->
                <div v-else class="create-new-lesson-dlg-editor-right" :style="{width: '50%'}">
                    <div class="create-new-lesson-dlg-editor-right-parse-text" :style="{color: errorsPresent ? '#ff4400' : ''}">
                        <b>Parse Result:</b> {{ parseResultMessage }}
                    </div>
                    <b-button variant="success" class="create-new-lesson-dlg-button" @click="runParser()" :disabled="currentlyParsing || editorContent.length == 0">
                        Run Parser
                    </b-button>
                    <div class="create-new-lesson-dlg-debug-message-box" :class="{ 'debug-message-box-flash' : flashDebugCardArea }">
                        <!-- Display of all returned debug messages -->
                        <div class="create-new-lesson-dlg-editor-right-no-msg-text" v-if="debugCardsByType.length == 0">
                            No debug messages to display.
                        </div>
                        <div
                            v-for="(card, i) in (optionGroupBySteps ? debugCardsByStep : debugCardsByType)"
                            :key="i"
                        >
                            <LessonFileDebugCard 
                                :details="card" 
                                class="create-new-lesson-debug-card" 
                                :groupedByStep="optionGroupBySteps"
                                :optionShowSuggestions="optionShowSuggestions"
                                v-if="hasNonSuggestionType(card) || optionShowSuggestions"
                                @jumpToLine="editorJumpToLine"
                                @openDoc="openDocFromDebugCard"
                            />
                        </div>
                    </div>

                    <div class="create-new-lesson-dlg-editor-right-divider"/>

                    <div v-if="!hideParserReturnOptions" :style="{display: 'flex', gap: '24px'}">
                        <b-form-checkbox v-model="optionGroupBySteps" switch>
                            Group by Step
                        </b-form-checkbox>
                        <b-form-checkbox v-model="optionShowSuggestions" switch>
                            Show Suggestions
                        </b-form-checkbox>
                    </div>
                    <div class="create-new-lesson-dlg-editor-right-hide-section-text" @click="toggleParserReturnOptions">
                        {{ hideParserReturnOptions ? 'Expand Parser Return options' : 'Collapse this section' }}
                    </div>

                    <div class="create-new-lesson-dlg-editor-right-divider"/>

                    <b-button :variant="initialPythonFile == '' ? 'warning' : 'danger'" class="create-new-lesson-dlg-button" @click="clickInitialPython" v-if="!hideFileOptions">
                        {{initialPythonFile == "" ? 'Add Initial Python File' : 'Remove Initial File [' + formatInitialPythonFileName + ']'}}
                    </b-button>
                    <div class="create-new-lesson-dlg-editor-right-warning-text" v-if="!hideFileOptions">
                        ⓘ Uploading a new Lesson File will overwrite the content currently inside the text editor. Download your current work to save it.
                    </div>
                    <b-button variant="primary" class="create-new-lesson-dlg-button" @click="uploadLessonFile" v-if="!hideFileOptions">
                        Upload Lesson File ({{getLessonFileSuffix}})
                    </b-button>
                    <b-button variant="secondary" class="create-new-lesson-dlg-button" @click="clickDownload" :disabled="editorContent.length == 0 || Boolean(downloadCooldown)" v-if="!hideFileOptions">
                        Download Lesson File ({{getLessonFileSuffix}})
                    </b-button>
                    <div class="create-new-lesson-dlg-editor-right-hide-section-text" @click="toggleFileOptions">
                        {{ hideFileOptions ? 'Expand Upload/Download options' : 'Collapse this section' }}
                    </div>
                </div>
            </div>                       
            
            <!-- PAGE 'testLesson' - Displays a summary of the loaded lesson and the configuration for running test mode -->
            <div v-if="modalPage === 'testLesson' && lessonParseResult" :style="{display: 'flex', flexDirection: 'row', gap: '16px', height: '100%', width: '100%'}">
                <div :style="{minWidth: '70%'}">
                    <!-- View of what the student will see opening the lesson -->
                    <LessonDetailsPreview :lesson="lessonParseResult"/>
                </div>
                <div class="create-new-lesson-dlg-test-mode-settings">
                    <div :style="{ fontSize: '20px', fontWeight: 'bold', fontStyle: 'italic', textDecoration: 'underline'}">Debug Settings</div>
                    <div class="create-new-lesson-dlg-editor-grey-text">
                        ⓘ These settings will only apply to this instance of running the Lesson. 
                        The student will only be able to see the information on the left, and will not have access to these settings.
                    </div>

                    <b-form-checkbox v-model="optionTestMode" switch>
                        Test Mode
                    </b-form-checkbox>
                    <!-- All other settings only apply when test mode is enabled -->
                    <b-form-checkbox v-model="optionDisableRequirements" switch v-if="optionTestMode">
                        Disable Step Requirements
                    </b-form-checkbox>
                    <b-form-checkbox v-model="optionClearEditorOnStart" switch v-if="optionTestMode">
                        Clear Python Editor on start
                    </b-form-checkbox>
                    <b-form-checkbox v-model="optionEnforceInitialFile" switch v-if="optionTestMode && optionClearEditorOnStart" :disabled="!hasInitialFile">
                        Initial File Upload {{ hasInitialFile ? '' : '(no &lt;initial&gt; specified in file)' }}
                    </b-form-checkbox>
                    <div v-if="optionTestMode">Begin on Step:</div>
                    <b-form-select
                        v-if="optionTestMode"
                        v-model="optionInitialStep"
                        :options="listStepsByName()"
                    />
                    <div v-if="!optionTestMode">
                        Test Mode is disabled. The Lesson will run identical to the student's experience.
                    </div>
                </div>
            </div>
            
        </div>
    </ModalDlg>    
</template>
<script lang="ts">

import Vue from "vue";

import ModalDlg from "@/components/ModalDlg.vue";
import { Lesson, LessonParseResult } from "@/types/types";
import { getParserConfig, parseFullLessonFile } from "@/helpers/lessonFileParser";
import LessonFileDebugCard, { DebugMessageCardGroup } from "./LessonFileDebugCard.vue";
import LessonDetailsPreview from "./LessonDetailsPreview.vue";
import { loadLessonProject, startLesson, updateTestModeSettings } from "@/helpers/runningLessonHandler";
import { saveAs } from "file-saver";
import LessonMarkupDocumentation from "./LessonMarkupDocumentation.vue";
import { openFile } from "@/helpers/filePicker";
import { strypeFileExtension } from "@/helpers/common";
import { getDocumentationContent } from "@/helpers/lessonMarkupDocumentationContent";
import App from "@/App.vue";

// Info to display when lessonParseResult happens to be null
const errorLoadingLesson: Lesson = {
    sourceLines: [],
    details: {
        title: "Error",
        description: "There was an error loading this lesson, refer to the console for more information",
        totalSteps: 0,
    },
};

type DocPageWithScroll = {
    page: string,
    scrollPos: number,
};

export default Vue.extend({
    components: {
        ModalDlg, 
        LessonFileDebugCard, 
        LessonDetailsPreview,
        LessonMarkupDocumentation,
    },
    
    props: {
        dlgId: String,
    },
    
    data: function() {
        return {
            modalPage: "landing", // This modal has multiple 'pages' to display, dictated by this value

            // PAGE 'landing' - a simple introduction page which displays when no lesson file is being editted yet
            landingSelection: 1, // Selected button on the landing page. 1, 2, and 3 are selections
            starterText: [
                "<metadata>",
                "    <title>",
                "        New Lesson",
                "    </title>",
                "    <description>",
                "        Describe your Lesson here.",
                "    </description>",
                "</metadata>",
                "",
                "<defaults>",
                "    <panel-type popup-right>",
                "</defaults>",
                "",
                "<step Step #1>",
                "    <text>",
                "        The first Step of many.",
                "    </text>",
                "</step>",
                "",
                "<step Step #2>",
                "    <text>",
                "        Now...",
                "        What will you teach today?",
                "    </text>",
                "    <attributes>",
                "        <colour-scheme blue>",
                "    </attributes>",
                "</step>",
            ], // Placeholder Lesson File for when starting a new one

            // PAGE 'editor' - main editing interface
            editorContent: "", // Store of the text area content

            hideParserReturnOptions: true, // Hides the sort/hide options regarding the debug message list
            hideFileOptions: false, // Hides download/upload buttons in 'editor' page
            optionGroupBySteps: false, // Chooses whether cards are grouped by debug message type or step. Does not affect their own sorting settings.
            optionShowSuggestions: true,

            lessonParseResult: null as LessonParseResult | null, // Temporary store of the parseResult returned by lessonFileParser.ts
            currentlyParsing: false,
            errorsPresent: false,

            debugCardsByType: [] as DebugMessageCardGroup[],
            debugCardsByStep: [] as DebugMessageCardGroup[],
            parseResultMessage: "The parser has not been run yet. Select 'Run Parser' to test your Lesson File for errors.",
            flashDebugCardArea: false, // For flash effect when running parser

            downloadCooldown: null as number | null, // Used to prevent multiple accidental downloads

            initialPythonFile: "", // Stores the initial python file seperate from the editor to prevent the user from modifying its contents
            initialPythonFileType: "py",
            initialPythonFileName: "", // Only used in editor

            showDocumentation: false,
            docPage: {page: "nontag_home", scrollPos: 0} as DocPageWithScroll,
            currentDocScrollPos: 0,
            searchBarContent: "",
            docBackPageStack: [] as DocPageWithScroll[], // Page history for forward and backward buttons
            docForwardPageStack: [] as DocPageWithScroll[],

            // PAGE 'testLesson' - similar to runLesson page in OpenLessonDlg, but with extra options for 'Test Mode'
            optionTestMode: true,
            optionInitialStep: 1,
            optionDisableRequirements: true,
            optionClearEditorOnStart: true,
            optionEnforceInitialFile: true,
        };
    },

    computed: {
        getPageTitle(): string {
            const pageTitleMap: Record<string, string> = {
                "landing": "Create New Lesson",
                "editor": "Editting Lesson File" + 
                    (this.lessonParseResult && this.lessonParseResult?.details.title != getParserConfig().PLACEHOLDER_TEXT ? 
                        ": '" + this.lessonParseResult?.details.title + "'" : "") + 
                    (this.initialPythonFile != "" ? 
                        " (Initial File Attached)" : ""),
                "testLesson": "Lesson File ready to run",
            };
            return pageTitleMap[this.modalPage];
        },

        getErrorLoadingLesson(): Lesson {
            return errorLoadingLesson;
        },

        getLessonFileSuffix(): string {
            return getParserConfig().LESSON_FILE_SUFFIX;
        },

        hasInitialFile(): boolean {
            return this.lessonParseResult?.details.initialFileType ? true : false;
        },

        formatInitialPythonFileName(): string {
            return (this.initialPythonFileName.length > 20 ? (this.initialPythonFileName.slice(0, 16) + "(...)." + this.initialPythonFileType) : this.initialPythonFileName);
        },
    },

    methods: {       
        toggleParserReturnOptions() {
            this.hideParserReturnOptions = !this.hideParserReturnOptions;
        },

        toggleFileOptions() {
            this.hideFileOptions = !this.hideFileOptions;
        },

        uploadLessonFile() {
            // Code here was adapted from Menu.vue's upload logic
            const parserConfig = getParserConfig();
            openFile(
                [{
                    description: "Strype Lesson File",
                    accept: {
                        "text/plain": [parserConfig.LESSON_FILE_SUFFIX],
                    },
                }],
                "documents",
                async (fileHandles) => {
                    if (!fileHandles || fileHandles.length === 0) {
                        alert("No file was uploaded.");
                        return;
                    }

                    const fileHandle = fileHandles[0];
                    const file = await fileHandle.getFile();

                    // Check file type
                    if (!file.name.endsWith(parserConfig.LESSON_FILE_SUFFIX) && !file.name.endsWith(".txt")) {
                        alert("Invalid file type uploaded. Please upload a " + parserConfig.LESSON_FILE_SUFFIX + " file.");
                        return;
                    }

                    if (file.size > parserConfig.MAX_FILE_SIZE_BYTES) {
                        alert("Uploaded file exceeds maximum size of " + (parserConfig.MAX_FILE_SIZE_BYTES / 1024) + "KB.");
                        return;
                    }

                    const text = await file.text();
                    
                    // Before setting the editor content, we need to remove the initial-python-file section if there is one
                    if(text.includes("<initial-python-file ") && text.includes("</initial-python-file>")) {
                        // Editor content gets everything besides the initial file
                        this.editorContent = text.slice(0, text.indexOf("<initial-python-file "));
                        if(this.editorContent.endsWith("<#> !!! DO NOT EDIT BELOW THIS LINE !!! </#>\n")) {
                            // Also remove the comment after, but don't use it for logic (shouldn't have stuff break from a comment)
                            this.editorContent = this.editorContent.slice(0, text.indexOf("\n<#> !!! DO NOT EDIT BELOW THIS LINE !!! </#>\n"));
                        }

                        let scanIndex = text.indexOf("<initial-python-file ") + "<initial-python-file ".length;
                        if(text.slice(scanIndex).startsWith("py")) {
                            this.initialPythonFileType = "py";
                            scanIndex += 4; // py + > + \n
                        }
                        else if(text.slice(scanIndex).startsWith(strypeFileExtension)) {
                            this.initialPythonFileType = strypeFileExtension;
                            scanIndex += strypeFileExtension.length + 2; // strypeFileExtension + > + \n
                        }
                        else {
                            alert("Unknown argument for Initial Python File. The initial file will not be uploaded.");
                            return;
                        }

                        // Initial File name isn't stored, so just assume same as Lesson File
                        this.initialPythonFileName = file.name.slice(0, file.name.indexOf(parserConfig.LESSON_FILE_SUFFIX)) + "." + this.initialPythonFileType;

                        // Extract the python content
                        this.initialPythonFile = text.slice(scanIndex, text.indexOf("\n</initial-python-file>"));
                    }
                    else {
                        //No initial file, set as normal
                        this.editorContent = text;
                    }

                    this.runParser(); // Parse the uploaded text instantly to update it
                }
            );
        },

        // Default browser behaviour makes 'tab' jump to the next element. Since the programmer will likely want to indent, this method overrides it with normal text editor logic
        // Partially inspired from code found here: https://stackoverflow.com/questions/6637341/use-tab-to-indent-in-textarea
        editorTypeTab(event: KeyboardEvent) {
            const editor = event.target as HTMLTextAreaElement;
            const start = editor.selectionStart;
            const end = editor.selectionEnd;

            editor.value =
                this.editorContent.substring(0, start) +
                "\t" +
                this.editorContent.substring(end);

            // Update cursor position
            editor.selectionStart = start + "\t".length;
            editor.selectionEnd = start + "\t".length;

            // Manually update the v-model (prevents re-rendering the textArea, which was making the cursor jump to the end)
            this.editorContent = editor.value;
        },

        editorJumpToLine(line: number) {
            const editor = this.$refs.textEditor as HTMLTextAreaElement;
            const allLines = this.editorContent.split("\n");
            if(line > allLines.length) {
                return;
            }

            // Locate the position by incrementing it by each line's length, until the target line is reached
            let pos = 0;
            for (let i = 0; i < line - 1; i++) {
                pos += allLines[i].length + 1; // + 1 for \n
            }

            // Focus on the area and adjust the selection position
            editor.focus();
            editor.selectionStart = pos;
            editor.selectionEnd = pos;
            editor.scrollTop = editor.scrollHeight * (line / allLines.length); // Scrolls to roughly the position of the line
        },

        getFullLessonFile(): string {
            // The editor only contains content that should be modifiable, which excludes the Initial File if there is one.
            if(this.initialPythonFile == "") {
                // No initial file, return just editor content
                return this.editorContent;
            }
            else {
                // Construct full file with hidden extra content
                return (
                    this.editorContent + "\n" +
                    "<#> !!! DO NOT EDIT BELOW THIS LINE !!! </#>\n" +
                    "<initial-python-file " + this.initialPythonFileType + ">\n" + 
                    this.initialPythonFile + "\n" +
                    "</initial-python-file>"
                );
            }
        },

        runParser() {
            // Runs the parser with whats currently in the text area
            this.currentlyParsing = true; // Temporarily disables the button
            this.showDocumentation = false; // Hides documenation if open
            this.lessonParseResult = parseFullLessonFile(this.getFullLessonFile().split("\n"));

            // Update status message depending on outcome
            if(!this.lessonParseResult.success) {
                this.parseResultMessage = "The parser terminated early with a fatal error that must be fixed before a full parse can be executed.";
            }
            else if(this.lessonParseResult.debugMessages.some((m) => m.messageType === "error")) {
                this.parseResultMessage = "The parser returned with errors that need to be fixed before the Lesson can be started.";
            }
            else if(this.lessonParseResult.debugMessages.some((m) => m.messageType === "warning")) {
                this.parseResultMessage = "The parser returned with warnings that could alter the intended behaviour. This Lesson can be started.";
            }
            else {
                this.parseResultMessage = "The parser returned with no problems. This Lesson can be started.";
            }
            this.parseResultMessage += " Last run at " + new Date(Date.now()).toLocaleTimeString() + ".";

            // Stores both variations at once so that it doesn't need to re-generate each when clicking the toggle
            this.debugCardsByStep = this.getDebugMessagesByStep();
            this.debugCardsByType = this.getDebugMessagesByType();

            this.optionEnforceInitialFile = this.lessonParseResult.details.initialFileType ? true : false; // Disables setting if it is irrelevant

            this.errorsPresent = this.lessonParseResult.debugMessages.some((m) => ["error", "fatal"].includes(m.messageType));
            this.currentlyParsing = false;
            this.flashDebugMessageBox();
        },

        flashDebugMessageBox() {
            // Removes and re-adds a class that makes the debug message container flash blue
            this.flashDebugCardArea = false;
            setTimeout(() => {
                this.flashDebugCardArea = true;
            }, 10);
        },

        getDebugMessagesByType(): DebugMessageCardGroup[] {
            if(!this.lessonParseResult) {
                return [];
            }
            const cardGroups = [
                ["fatal", "FATAL ERROR"], // [message type, card title]
                ["error", "Errors"],
                ["warning", "Warnings"],
                ["suggestion", "Suggestions"],
            ];
        
            // The map function below takes the card groups above and assigns all related messages to each card
            return cardGroups.map(
                ([keyword, name]) => {
                    const filteredList = this.lessonParseResult ? this.lessonParseResult.debugMessages.filter(
                        (m) => m.messageType === keyword // Obtain list of related messages
                    ) : [];
                    return { // Create card
                        title: name,
                        contents: filteredList,
                        titleColourType: keyword,
                    };
                }
            ).filter((c) => c.contents.length > 0); // Delete cards with no content
        },

        getDebugMessagesByStep(): DebugMessageCardGroup[] {
            if(!this.lessonParseResult) {
                return [];
            }
            const allMessages = this.lessonParseResult.debugMessages;
            const cards = [] as DebugMessageCardGroup[];
            const typePriority = ["fatal", "error", "warning", "suggestion"]; 
            // ^^^ Uses .find to select the first type that appears in the card, colouring it based on the most severe debug message present

            // First, add a 'General' card for all errors not related to a Step (usually missing metadata or random text strings)
            const generalMessages = allMessages.filter((m) => !m.stepRef || m.stepRef == "");
            if(generalMessages.length > 0) {
                cards.push({
                    title: "General",
                    contents: generalMessages,
                    titleColourType: typePriority.find((type) => generalMessages.some((m) => m.messageType === type)) || "suggestion",
                });
            }

            // Now add the rest of the steps
            // This time the cardGroups equivalent is each individual Step's stepRef
            this.lessonParseResult.steps.forEach((step, i) => {
                const thisStepMessages = allMessages.filter((m) => m.stepRef == step.stepRef);
                if(thisStepMessages.length > 0) {
                    cards.push({
                        title: step.stepRef,
                        contents: thisStepMessages,
                        titleColourType: typePriority.find((type) => thisStepMessages.some((m) => m.messageType === type)) || "suggestion",
                    });
                }
            });

            return cards;
        },

        hasNonSuggestionType(card: DebugMessageCardGroup): boolean {
            // If a card only has suggestions, it will need to be entirely hidden when 'Show Suggestions' is off
            return card.contents.some((m) => m.messageType != "suggestion");
        },

        updateDocScrollPos(pos: number) {
            this.currentDocScrollPos = pos;
        },

        updateDocPage(newPage: string, goingBack?: boolean, preserveForward?: boolean, preScroll?: number) {
            if(goingBack) {
                this.docForwardPageStack.push({
                    page: this.docPage.page,
                    scrollPos: this.currentDocScrollPos,
                });
            }
            else {
                this.docBackPageStack.push({
                    page: this.docPage.page,
                    scrollPos: this.currentDocScrollPos,
                });
                if(this.docBackPageStack.length > 10) {
                    this.docBackPageStack = this.docBackPageStack.slice(1);
                }
                if(!preserveForward) {
                    this.docForwardPageStack.length = 0; //erase previous forward stack
                }
            }

            this.docPage = {page: newPage, scrollPos: preScroll ?? -1}; //-1 implies it needs to calculate the new scroll position
        },

        listStepsByName() {
            // Value is used to assign an index to each element
            if (!this.lessonParseResult) {
                return [{
                    value: -1, 
                    text: "Error loading Steps",
                }];
            }

            return this.lessonParseResult.steps.map((s, i) => ({
                value: i+1,
                text: "#" + (i+1) + " - " + s.stepRef,
            }));
        },

        openDocFromDebugCard(search: string) {
            this.showDocumentation = true;
            this.updateDocPage(search, false, false, -1);
        },

        clickBackToOpenLesson() {
            this.$emit("open-load-lesson"); // Sends message to Menu.vue
        },  

        clickContinueLanding() {
            // Method to handle clicking the 'Continue' button on the landing page. 
            // Result depends on the selected button, but all three open the editor. Mainly just to help guide newer programmers.

            if(this.landingSelection == 2) { // 'Upload' selected
                // Upload lesson file - prompt the user to upload a .txt file and then load that into the editor. Uploading is handled in a seperate function
                this.uploadLessonFile();
            }
            else {
                // Create new lesson file - open the editor and fill the area with placeholder text
                if(this.editorContent == "") {
                    // If there is already content in the editor, then the landing page shouldn't be open in the first place.
                    // However, on the off chance something goes wrong and there is already content, we don't want to erase it.
                    this.editorContent = this.starterText.join("\n");
                }
                if(this.landingSelection == 3) { // 'Documentation' selected
                    // Open documentation - does as it says
                    this.showDocumentation = true;
                }
            }

            this.modalPage = "editor";
        },

        clickDownload() {
            // Run the parser to get an updated lesson title
            this.runParser();
            let fileName = this.lessonParseResult?.details.title.replace(" ", "_");
            if(fileName == getParserConfig().PLACEHOLDER_TEXT) { // When a fatal error occurs before running the file
                fileName = "Unnamed_Strype_Lesson";
            }

            const textBlob = new Blob([this.getFullLessonFile()], {type: "text/plain"});
            saveAs(textBlob, fileName + getParserConfig().LESSON_FILE_SUFFIX);

            // 1 second cooldown to avoid accidental duplicate downloads
            if (!this.downloadCooldown) {
                this.downloadCooldown = window.setTimeout(() => {
                    this.downloadCooldown = null; // Clear timer after the cooldown expires
                }, 1000);
            }
        },

        clickInitialPython() {
            if(this.initialPythonFile == "") {
                // Add new file
                // Code here was adapted from Menu.vue's upload logic
                const parserConfig = getParserConfig();
                openFile(
                    [
                        // IMPORTANT: the file type displays here are copied from Menu.vue's strypeProjMIMEDescArray() and pythonImportMIMEDescArray()
                        // Whilst I would keep them synced, computed methods from components cannot be exported. 
                        // I didn't want to change existing code too much, so for now this is just a copy.
                        {
                            description: this.$i18n.t("strypeFileDesc") as string,
                            accept: {
                                "application/strype": ["."+strypeFileExtension],
                            },
                        },
                        {
                            description: this.$i18n.t("pythonFileDesc") as string,
                            accept: {
                                "text/x-python": [".py"],
                            },
                        },
                    ],
                    "documents",
                    async (fileHandles) => {
                        if (!fileHandles || fileHandles.length === 0) {
                            alert("No file was uploaded.");
                            return;
                        }

                        const fileHandle = fileHandles[0];
                        const file = await fileHandle.getFile();

                        // Check file type
                        if (!file.name.endsWith(".py") && !file.name.endsWith("." + strypeFileExtension)) {
                            alert("Invalid file type uploaded. Please upload a .py or ." + strypeFileExtension + " file.");
                            return;
                        }

                        if (file.size > parserConfig.MAX_INITIAL_PYTHON_SIZE_BYTES) {
                            alert("Uploaded file exceeds maximum size of " + (parserConfig.MAX_INITIAL_PYTHON_SIZE_BYTES / 1024) + "KB.");
                            return;
                        }

                        // Store uploaded info
                        this.initialPythonFile = await file.text();
                        this.initialPythonFileName = file.name;
                        this.initialPythonFileType = file.name.endsWith(".py") ? "py" : strypeFileExtension;
                    }
                );

            }
            else {
                // Delete existing file
                this.initialPythonFile = "";
                this.initialPythonFileName = "";
                alert("The Initial Python File '" + this.initialPythonFileName + "' has been removed from the Lesson File. If this was a mistake, please re-upload the same file.");
            }
        },

        clickSearchSelectedKeyword() {
            // Simply put the selected keyword in the search bar and then search
            const editor = this.$refs.textEditor as HTMLTextAreaElement;
            if(editor.selectionStart != editor.selectionEnd) { // Doesn't do anything when nothing is selected
                this.searchBarContent = editor.value.slice(editor.selectionStart, editor.selectionEnd).trim();
                this.clickSearchDocumentation();
            }
        },

        clickSearchDocumentation() {
            const page = getDocumentationContent(this.searchBarContent);
            if(page.title == "Page not found.") {
                alert("No results for that search.");
            }
            else {
                this.updateDocPage(this.searchBarContent, false, false, -1);
                this.showDocumentation = true; // Incase it is clicked with documentation closed
            }
        },

        clickBackDocPage() {
            if(this.docBackPageStack.length > 0) { // Button will be disabled if false
                const targetPage = this.docBackPageStack.pop() ?? {page: "", scrollPos: 0};
                this.updateDocPage(targetPage.page, true, true, targetPage.scrollPos);
            }
        },

        clickForwardDocPage() {
            if(this.docForwardPageStack.length > 0) { // Button will be disabled if false
                const targetPage = this.docForwardPageStack.pop() ?? {page: "", scrollPos: 0};
                this.updateDocPage(targetPage.page, false, true, targetPage.scrollPos);
            }
        },

        clickTestLesson() {
            // Brings the user to the testLesson page, but only if they have no errors.
            this.runParser();
            if(!this.errorsPresent) {
                this.modalPage = "testLesson";
            }
        },

        clickRunLesson() {
            if(this.lessonParseResult) {
                updateTestModeSettings(this.optionTestMode, this.optionTestMode ? {
                    initialStep: this.optionInitialStep,
                    disableRequirements: this.optionDisableRequirements,
                    clearEditorOnStart: this.optionClearEditorOnStart,
                    enforceInitialFile: this.optionEnforceInitialFile && this.optionClearEditorOnStart, //cant enforce initial file without clearing the editor
                } : undefined); // Undefined = default options

                const sourceLines = this.getFullLessonFile().split("\n");

                if(this.optionClearEditorOnStart) {
                    loadLessonProject(this.lessonParseResult, sourceLines, this.$root.$children[0] as InstanceType<typeof App>, !this.optionEnforceInitialFile);
                }
                startLesson(this.lessonParseResult, this.getFullLessonFile().split("\n"));

                window.setTimeout(() => {
                    this.modalPage = "editor"; // Go back to editor page with a brief delay so that it happens after the modal is hidden
                }, 500);
                this.$root.$emit("bv::hide::modal", this.dlgId); // Hide the modal
            }
        },
    },
});
</script>
<style lang="scss">

.create-new-lesson-dlg > .modal-md {
    width: auto;
    min-width: min(800px, 80vw);
}

.create-new-lesson-dlg .modal-body { // height override
    height: 75vh;
    overflow-y: auto;
}

.create-new-lesson-dlg-landing-page {
    display: flex;
    flex-direction: column;
    gap: 40px;
    align-items: center;
    justify-content: center;
    height: 100%;
    width: 100%;
}
.create-new-lesson-dlg-landing-title {
    font-size: 32px;
    font-weight: 600;
    text-align: center;
}

.create-new-lesson-dlg-landing-button-row {
    display: flex;
    gap: 40px;
}

.create-new-lesson-dlg-landing-button {
    width: 240px;
    height: 220px;
    border-radius: 16px;
    border: 2px solid #dddddd;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;
    padding: 20px;
    box-shadow: 0 2px 6px black;
    cursor: pointer;
}

.create-new-lesson-dlg-landing-button:hover {
    background-color: #d6d6d6;
    box-shadow: 0 1px 4px black;
}

.create-new-lesson-dlg-landing-button-selected, .create-new-lesson-dlg-landing-button-selected:hover {
    background-color: #7dbcff;
    box-shadow: 0 2px 6px #969696;
}

.create-new-lesson-dlg-landing-button img {
    width: 120px;
    height: 120px;
    opacity: 70%;
    object-fit: contain;
}

.create-new-lesson-dlg-landing-button-text {
    font-size: 18px;
    font-weight: 500;
}

.create-new-lesson-dlg-editor-left {
    height: 100%;
    padding: 4px;
    box-sizing: border-box;
    display: flex;
}

.create-new-lesson-dlg-editor-right {
    height: 100%;
    padding: 4px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    box-sizing: border-box;
    align-items: center;
}

.create-new-lesson-dlg-editor-textarea {
    width: 100%;
    height: 100%;
    resize: none;
    border-radius: 10px;
    border: 2px solid #cccccc;
    padding: 10px;
    font-size: 16px;
    box-sizing: border-box;
    font-family: monospace;
    tab-size: 4; // default is 8, takes up too much space
    overflow-y: auto; // scrolling inside text area
    overflow-x: auto;
    white-space: pre; // no text wrapping for accurate line numbers
}

.create-new-lesson-dlg-editor-right-warning-text {
    display: flex;
    text-align: center;
    font-size: 14px;
    color: red;
    font-style: italic;
}

.create-new-lesson-dlg-editor-right-hide-section-text {
    display: flex;
    text-align: center;
    font-size: 11px;
    cursor: pointer;
    color: rgb(97, 97, 97);
    text-decoration: underline;
}

.create-new-lesson-dlg-editor-right-hide-section-text:hover {
    color: #3bb9d8;
}

.create-new-lesson-dlg-editor-right-parse-text {
    font-size: 15px;
    line-height: 1.3;
    text-align: center;
}

.create-new-lesson-dlg-editor-right-no-msg-text {
    display: flex;
    justify-content: center;
    align-items: center;
    text-align: center;
    color: gray;
    font-size: 15px;
    opacity: 50%;
    height: 100%;
    width: 100%;
    font-style: italic;
}

.create-new-lesson-dlg-button {
    justify-content: center;
    align-items: center;
    width: 70%;
    height: 36px;
}

.create-new-lesson-dlg-editor-right-divider {
    height: 2px;
    width: 100%;
    background: black;
    opacity: 15%;
    margin: 4px 0;
}

.create-new-lesson-dlg-debug-message-box {
    flex: 1;
    width: 90%;
    min-height: 0;
    border-radius: 10px;
    border: 1px solid #cccccc;
    padding: 6px;
    padding-top: 12px;
    gap: 10px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    overflow-y: auto; // scrolling content
    scrollbar-gutter: stable both-edges; // stops cards from shifting in size when the bar appears
}

.debug-message-box-flash {
    animation: flashDebugMessageBox 1s ease forwards;
}

@keyframes flashDebugMessageBox {
    0%   { background-color: #e8f4ff; }
    100% { background-color: white; }
}

.create-new-lesson-debug-card {
    border-radius: 6px;
    border: 2px solid #585858;
}

.create-new-lesson-dlg-test-mode-settings {
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    border-left: 2px solid #cccccc;
}

.create-new-lesson-dlg-editor-grey-text {
    display: flex;
    font-size: 14px;
    color: #979797;
    font-style: italic;
}

</style>