<template>
    <!-- Full height and width of parent div. The sizing and positioning of a card is controlled by the parent component -->
    <div class="lfdc-base" :class="'lfdc-colour-' + titleColour">
        <div class="lfdc-card-header"  @click="toggleExpanded">
            <button class="lfdc-expand-button">
                {{ isExpanded ? '-' : '+' }}
            </button>
            <span>
                <b>{{ cardDetails.title }}</b>
            </span>
            <div class="lfdc-card-badge">
                {{ cardDetails.contents.length }}
            </div>
        </div>

        <div class="lfdc-card-body" v-if="isExpanded">
            <div v-for="(msg, i) in cardDetails.contents" :key="i">
                <div class="lfdc-message-frame" :class="'lfdc-colour-' + msg.messageType" v-if="showSuggestions || msg.messageType != 'suggestion'">
                    <div class="ldfc-message-context-bar">
                        <div class="lfdc-message-line-num" v-if="msg.lineNum > 0">
                            <span class="lfdc-message-line-num lfdc-message-line-num-link" @click="jumpToLine(msg.lineNum)">
                                Line {{ msg.lineNum }}
                            </span>
                            <span v-if="msg.stepRef && msg.stepRef != '' && !groupedByStep">
                                - {{ msg.stepRef }}
                            </span>
                            <span v-if="groupedByStep">
                                - {{ msg.messageType[0].toUpperCase() + msg.messageType.slice(1) }} <!-- Capitalise first char -->
                            </span>
                        </div>
                        <div class="lfdc-message-line-num lfdc-message-line-num-link" style="margin-left: auto;" @click="openDocPage(msg.documentationKeyword)" v-if="msg.documentationKeyword != ''">
                            {{ formatDocWord(msg.documentationKeyword) }}
                        </div>
                    </div>
                    <div class="lfdc-message-text">
                        {{ msg.debugMessageContent }}
                    </div>
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
import scssVars from "@/assets/style/_export.module.scss";
import { LessonParseDebugMessage } from "@/types/types";

//////////////////////
//     Component    //
//////////////////////

export type DebugMessageCardGroup = {
    title: string,
    contents: LessonParseDebugMessage[],
    titleColourType: string, // Individual messages have their colour affected by their message type, but the title needs to be specified
};

export default Vue.extend({
    name: "LessonFileDebugMessage",

    props: {
        details: {
            type: Object,
            required: true,
        },
        groupedByStep: {
            type: Boolean,
            required: false,
            default: false,
        },
        showSuggestions: {
            type: Boolean,
            required: false,
            default: true,
        },
    },

    data: function() {
        return {
            isExpanded: false,
        };
    },

    computed: {
        scssVars() {
            // just to be able to use in template
            return scssVars;
        },

        titleColour(): string {
            return this.details.titleColourType;
        },

        cardDetails(): DebugMessageCardGroup {
            return this.details;
        },
    },

    methods: {
        toggleExpanded() {
            this.isExpanded = !this.isExpanded;
        },

        jumpToLine(line: number) {
            this.$emit("jumpToLine", line);
        },

        formatDocWord(ref: string) {
            const strippedWord = ref.replaceAll(/[!/]/g, "").replaceAll("nontag_", "").replaceAll("_inHint", "").replaceAll("-", " ");
            return strippedWord[0].toUpperCase() + strippedWord.slice(1);
        },

        openDocPage(ref: string) {
            this.$emit("openDoc", ref);
        },
    },
});
</script>

<style scoped lang="scss">

//lfdc -> lesson file debug card

// colour schemes
.lfdc-colour-fatal {
  background: #ff6767;
}

.lfdc-colour-error {
  background: #ff9d65;
}

.lfdc-colour-warning {
  background: #ffeaa4;
}

.lfdc-colour-suggestion {
  background: #b5c7c9;
}

// css
.lfdc-base {
    width: 100%;
    display: flex;
    flex-direction: column;
    opacity: 95%;
}

.lfdc-base:hover {
    filter: brightness(1.02);
}

.lfdc-expand-button {
    width: 16px;
    height: 16px;
    display: flex;
    justify-content: center;
    border-radius: 999px; // round
    border: none;
    padding: 0;
    line-height: 0.8;
    background-color: #eeeeee;
    opacity: 60%;
}

.lfdc-card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 8px;
    cursor: pointer; // indicates how the whole header can be clicked rather than just the button
}

.lfdc-card-badge {
    margin-left: auto;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px; // round
    font-size: 14px;
    font-weight: 600;
    opacity: 50%;
    color: #333;
}


.lfdc-card-body { // expanded contents containing the messages
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
}

.lfdc-message-frame {
    border-radius: 6px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    filter: brightness(1.1);
}

.lfdc-message-frame:hover {
    filter: brightness(1.2);
}

.ldfc-message-context-bar {
    display: flex;
    width: 100%;
}

.lfdc-message-line-num {
    font-size: 12px;
    font-weight: 600;
    font-style: italic;
    opacity: 0.7;
    color: black;
}

.lfdc-message-line-num-link {
    text-decoration: underline;
    cursor: pointer;
}

.lfdc-message-line-num-link:hover {
    color: #002f86;
}

.lfdc-message-text {
    font-size: 13px;
    word-break: break-word;
}

</style>