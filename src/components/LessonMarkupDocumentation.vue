<!-- Handles the display of the Lesson File Markup Language's Documentation -->
<template>
    <div class="lesson-markup-documentation-base">
        <div class="lesson-markup-documentation-scroll" ref="scrollElement" @scroll="emitScrollPos">
            <!-- All pages will have a title and some base text -->
            <h1 class="lesson-markup-documentation-header">{{pageContent.title}}</h1>
            <div class="lesson-markup-documentation-simple-text">
                <span
                    v-for="(segment, t) in pageContent.description"
                    :key="t"
                    :class="{'lesson-markup-documentation-code-text': segment.isCode}"
                >
                    <span
                        v-if="Boolean(segment.link)"
                        @click="pageChange(segment.link || '')"
                        :class="{'lesson-markup-documentation-link lesson-markup-documentation-simple-text': !segment.isCode, 
                            'lesson-markup-documentation-code-tag-link' : segment.isCode}"
                    >{{ segment.tx.trim() }}</span> <!-- This looks ugly, but having the </span> on the next line causes an underlined space :/ -->
                    <span v-else>
                        {{ segment.tx }}
                    </span>
                </span>
            </div>

            <!-- Rest of the content handled here -->
            <div
                v-for="(section, i) in pageContent.subsections"
                :key="i"
            >
                <h2 class="lesson-markup-documentation-subheader" :ref="'scrollPoint_' + section.reference">
                    {{ section.name }}
                </h2>

                <!-- Tag display -->
                <div v-if="section.tagInfo" class="lesson-markup-documentation-code-text" style="padding-bottom: 6px;">
                    {{ formatText(section.tagInfo.display, section) }}
                </div>

                <!-- Keywords -->
                <div 
                    v-for="(keyword, k) in section.keywords"
                    :key="k"
                    class="lesson-markup-documentation-keyword"
                    @mouseenter="hoverDefinitionContent = getDefinitionContent(keyword); hoverDefinitionSection = section;"
                    @mouseleave="hoverDefinitionContent = {tx: ''}"
                    :class="{'lesson-markup-documentation-keyword-required-colour' : isRedKeyword(keyword)}"
                >
                    {{ formatText(keyword, section) }} <!-- Displays enum value -->
                </div>

                <!-- Text Content -->
                <div class="lesson-markup-documentation-simple-text">
                    <span
                        v-for="(segment, t) in section.extraText"
                        :key="t"
                        :class="{'lesson-markup-documentation-code-text': segment.isCode}"
                    >
                        <span
                            v-if="Boolean(segment.link)"
                            @click="pageChange(segment.link || '')"
                            :class="{'lesson-markup-documentation-link lesson-markup-documentation-simple-text': !segment.isCode, 
                                'lesson-markup-documentation-code-tag-link' : segment.isCode}"
                        >{{ segment.tx }}</span>
                        <span v-else>
                            {{ segment.tx }}
                        </span>
                    </span>
                </div>
            </div>
        </div>

        <!-- Definition Box -->
        <div v-if="hoverDefinitionContent.tx != ''" class="lesson-markup-documentation-definition-box">
            <div class="lesson-markup-documentation-simple-text"  style="font-size: 16px; font-style: italic;">
                {{formatText(hoverDefinitionContent.tx, hoverDefinitionSection)}}
            </div>
            <div v-if="hoverDefinitionContent.code" class="lesson-markup-documentation-code-text" style="font-size: 15px;">
                {{formatText(hoverDefinitionContent.code, hoverDefinitionSection)}}
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
import { DocKeywords, DocPageNodeSection, DocPageTree, getDefinitionMessageKeyword, getDocumentationContent, matchSectionReferenceInDocPage, replaceDocReferenceValues } from "@/helpers/lessonMarkupDocumentationContent";

//////////////////////
//     Component    //
//////////////////////

export default Vue.extend({
    name: "LessonMarkupDocumentation",

    props: {
        pageRef: {
            type: Object,
            required: true,
        },
    },

    watch: {
        // Updates scroll position on requested change upon reloading the page
        pageRef: {
            deep: true,
            immediate: true,
            handler(newVal) {
                this.$nextTick(() => {
                    if (newVal.scrollPos == -1) {
                        this.scrollToSection(newVal.page);
                    } 
                    else {
                        this.scrollToValue(newVal.scrollPos);
                    }
                });
            },
        },
    },

    data: function() {
        return {
            hoverDefinitionContent: {tx: ""} as {tx: string, code?: string},
            hoverDefinitionSection: {
                name: "Placeholder",
                reference: "",
                extraText: [],
                keywords: [],
            } as DocPageNodeSection,

            downloadCooldown: null as number | null, // Used to prevent multiple accidental downloads for Example Lesson Files 
        };
    },

    computed: {
        scssVars() {
            // just to be able to use in template
            return scssVars;
        },

        pageContent(): DocPageTree {
            return getDocumentationContent(this.pageRef.page);
        },
    },

    methods: {
        scrollToSection(ref: string) {
            const scrollBox = this.$refs.scrollElement as HTMLElement;

            // Needs to find the scroll position for this specific element
            const elementRef = "scrollPoint_" + matchSectionReferenceInDocPage(this.pageContent, ref);

            if(elementRef != "scrollPoint_") { // matchSectionReferenceInDocPage didn't return ""
                const sectionRef = this.$refs[elementRef] as HTMLElement | HTMLElement[]; // if there are multiple identical refs it will return as an array
                const section = Array.isArray(sectionRef) ? sectionRef[0] : sectionRef;

                if (section) {
                    // calculates position relative to scrollBox
                    scrollBox.scrollTop += section.getBoundingClientRect().top - scrollBox.getBoundingClientRect().top;
                    return;
                }
            }
            
            scrollBox.scrollTop = 0; // If section wasn't found somehow, just default to top
        },

        scrollToValue(value: number) {
            const scrollBox = this.$refs.scrollElement as HTMLElement;
            scrollBox.scrollTop = value;
        },

        emitScrollPos(event: Event) {
            const scrollBox = event.target as HTMLElement;
            this.$emit("emit-scroll-pos", scrollBox.scrollTop);
        },
        
        formatText(text: string, section: DocPageNodeSection): string {
            return replaceDocReferenceValues(text, section);
        },

        getDefinitionContent(ref: DocKeywords){
            return getDefinitionMessageKeyword(ref);
        },

        isRedKeyword(ref: DocKeywords): boolean {
            return [
                DocKeywords.Rule_Required, 
                DocKeywords.Rule_Automated,
                DocKeywords.Rule_ReqNegationBlocked, 
                DocKeywords.Rule_ReqHintExclusive,
            ].includes(ref) ;
        },

        pageChange(newPage: string) {
            this.$emit("go-to-documentation-page", newPage);
        },
    },
});
</script>

<style scoped lang="scss">

.lesson-markup-documentation-base {
    display: flex;
    flex-direction: column;
    position: relative;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    border: 2px solid #a0a0a0;
}

.lesson-markup-documentation-scroll {
    display: flex;
    flex-direction: column;
    padding: 16px;
    gap: 12px;
    overflow-y: auto;
    min-height: 0;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    padding-bottom: 100px; // extra empty space so that the definition box doesn't cover text
}

.lesson-markup-documentation-header {
    font-size: 36px;
    font-weight: bold;
    margin: 0;
}

.lesson-markup-documentation-subheader {
    font-size: 28px;
    font-weight: 500;
    padding-top: 12px;
}

.lesson-markup-documentation-keyword {
    color: #2e0041;
    font-size: 18px;
    font-weight: 600;
    letter-spacing: -1px;
    cursor: help;
    white-space: pre-line; // needed to make \n work
    padding-bottom: 2px;
}

.lesson-markup-documentation-keyword-required-colour {
    color: #bb0000;
}

.lesson-markup-documentation-keyword:hover {
    color: #3bb9d8;
}

.lesson-markup-documentation-simple-text {
    font-size: 17px;
    white-space: pre-line; // needed to make \n work
}

.lesson-markup-documentation-code-text {
    font-size: 18px;
    font-family: monospace;
    tab-size: 4; // default is 8, takes up too much space
    white-space: pre; // needed to make \n and \t work
}

.lesson-markup-documentation-link {
    text-decoration: underline;
}

.lesson-markup-documentation-code-tag-link {
    font-weight: 600;
}

.lesson-markup-documentation-link:hover, .lesson-markup-documentation-code-tag-link:hover {
    color: #3bb9d8;
    cursor: pointer;
}

.lesson-markup-documentation-definition-box {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 6px;
    padding-right: 10px;
    padding-left: 10px;
    max-height: 40vh;
    max-width: 100%;
    background: white;
    border-top: 2px solid #ddd;
    display: flex;
    flex-direction: column;
    white-space: pre-wrap;
    overflow-x: hidden;
}

</style>