import { getParserConfig, LessonParserConfiguration } from "./lessonFileParser";
import { fetchValidParameters } from "./lessonFileTokenEvaluater";

export interface DocPageTree {
    title: string,
    description: DocStringSegment[],
    subsections: DocPageNodeSection[],
}

export interface DocPageNodeSection {
    name: string,
    reference: string, // Can be blank, meaning it can't be linked to
    keywords: DocKeywords[],
    extraText: DocStringSegment[], 

    // Extra content specific to tags if necessary
    tagInfo?: TagDocumenationInfo,
}

interface TagDocumenationInfo { // Tag name is stored in reference where needed
    name: string,
    display: TagDisplay,
    validNests: string[], // Does NOT include variant nests such as requirements_inHint, as these are parser-logic-exclusive and will only confuse the programmer
}

type DocStringSegment = {
    tx: string;
    link?: string; // No link means normal text
    isCode?: boolean; // If true, it is displayed in the code font
};

// A list of all keywords to be displayed under certain pages.
// The string matchups here will be displayed on the page. When a $ is used, it indicates a word being replaced.
// For example, mentions of $tag are replaced with the actual tag name.
export enum DocKeywords {
    TagType_DataSection = "Tag Type: Data Section.",
    TagType_TextSection = "Tag Type: Text Section.",
    TagType_Data = "Tag Type: Data.",

    ExpectedArgs_Zero = "Expected Arguments: None.",
    ExpectedArgs_One = "Expected Arguments: 1.",
    // Currently no tags use more than 1 argument
    ExpectedArgs_Boolean = "Expected Arguments: 0 or 1.",

    ArgType_StringAny = "Argument Type: String.",
    ArgType_StringFixedSet = "Argument Type: String from a fixed set of inputs.\nValid Inputs: $argTypeShort = \n[$tagInputList].",
    ArgType_PositiveInteger = "Argument Type: Positive Integer Value.",
    ArgType_Boolean = "Argument Type: Boolean.",

    ValidNest_Any = "Valid Nest Sections: Any.", // Only for comments
    ValidNest_Base = "Valid Nest Sections: Base (no Parent Section).",
    ValidNest_List = "Valid Nest Sections: $validNestList.",

    Rule_Required = "Required.",
    Rule_Unique = "Section-Unique.",
    Rule_Automated = "Automated - Do not type.",
    Rule_ReqNegationBlocked = "Cannot be Negated on Steps.",
    Rule_ReqHintExclusive = "Can only be used for Hints.",
}

export enum TagDisplay {
    Plain = "<$tag>",
    WithCloser = "<$tag>\n\t...\n </$tag>",
    WithArg = "<$tag $argTypeShort>",
    WithCloserArg = "<$tag $argTypeShort>\n\t...\n </$tag>",
    WithNegation = "<$tag>, <!$tag>",
    WithNegationArg = "<$tag $argTypeShort>, <!$tag $argTypeShort>",
    WithNegationCloser = "<$tag>\n\t...\n </$tag>,\n<!$tag>\n\t...\n </!$tag>,\n",
}

// Used to provide extra definitions where needed
export function getDefinitionMessageKeyword(ref: DocKeywords): {tx: string, code?: string} {
    const defMap: Record<DocKeywords, {tx: string, code?: string}> = {
        [DocKeywords.TagType_DataSection]: {tx: "A Section containing other Tags."},
        [DocKeywords.TagType_TextSection]: {tx: "A Section containing a Text value."},
        [DocKeywords.TagType_Data]: {tx: "A Tag for altering a value."},

        [DocKeywords.ExpectedArgs_Zero]: {tx: "The Tag is written on its own:", code: "<$tag>"},
        [DocKeywords.ExpectedArgs_One]: {tx: "Expects an argument $argTypeShort:", code: "<$tag $argTypeShort>"},
        [DocKeywords.ExpectedArgs_Boolean]: {tx: "Boolean Argument Tags default to 'true' with no provided argument.", code: "<$tag> == <$tag true>"},

        [DocKeywords.ArgType_StringAny]: {tx: "Expecting a String argument, for example:", code: "<$tag HelloWorld>"},
        [DocKeywords.ArgType_StringFixedSet]: {tx: "Expecting an argument from the list of valid arguments, for example:", code: "<$tag $tagInputExample>"},
        [DocKeywords.ArgType_PositiveInteger]: {tx: "Expecting a positive integer argument, for example:", code: "<$tag 3>"},
        [DocKeywords.ArgType_Boolean]: {tx: "Expecting a Boolean argument, but does not require one:", code: "<$tag> or <$tag true> for True\n <$tag false> for False (if <defaults> has set to true)"},

        [DocKeywords.ValidNest_Any]: {tx: "Can be placed anywhere in the file."},
        [DocKeywords.ValidNest_Base]: {tx: "Cannot be placed inside a Parent Section."},
        [DocKeywords.ValidNest_List]: {tx: "Can only be placed with one of the listed Tags as its direct Parent Section, for example: ", code: "<$validNestExample>\n\t<$tag>\n </$validNestExample>"},

        [DocKeywords.Rule_Required]: {tx: "At least one instance of this Tag is required for a functional Lesson."},
        [DocKeywords.Rule_Unique]: {tx: "Multiple instances of this Tag cannot share the same Parent Section."},
        [DocKeywords.Rule_Automated]: {tx: "This Tag is handled by the editor and should not be used."},
        [DocKeywords.Rule_ReqNegationBlocked]: {tx: "The Negation of this Requirement can only be used on Hints, and is not allowed to be used on Steps: ", code: "<!$tag>"},
        [DocKeywords.Rule_ReqHintExclusive]: {tx: "This Requirement Type can only be used on Hints: ", code: "<hint>\n\t<$tag>\n </hint>"},
    };

    return defMap[ref] ?? {tx: ""}; // "" does not display a definition
}

// Takes in an inputted string with some context and replaces all instances of 'reference' values, indicated with $
export function replaceDocReferenceValues(rawText: string, context: DocPageNodeSection): string {
    let newString = rawText;

    // $argTypeShort -> a letter corresponding to the arg type, determined by presence of ArgType_ enum types
    if(rawText.includes("$argTypeShort")) {
        let argTypeShort = "X";
        if(context.keywords.includes(DocKeywords.ArgType_StringAny) || context.keywords.includes(DocKeywords.ArgType_StringFixedSet)) {
            argTypeShort = "S";
        }
        else if(context.keywords.includes(DocKeywords.ArgType_PositiveInteger)) {
            argTypeShort = "N";
        }
        else if(context.keywords.includes(DocKeywords.ArgType_Boolean)) {
            argTypeShort = "B";
        }
        newString = newString.replaceAll("$argTypeShort", argTypeShort);
    }

    if(rawText.includes("$tagInputList") || rawText.includes("$tagInputExample")) {
        // $tagInputList -> the list of all valid inputs, fetched from lessonFileTokenEvaluator()
        const validInputs = fetchValidParameters(context.tagInfo?.name ?? "");
        newString = newString.replaceAll("$tagInputList", validInputs.map((p) => "'" + p + "'").join(", "));
        
        // $tagInputExample -> the first element of tagInputList
        newString = newString.replaceAll("$tagInputExample", validInputs[0]);
    }

    if(rawText.includes("$validNestList") || rawText.includes("$validNestExample")) {
        // $validNestList -> the list of valid nests, stored in the object data defined in getDocumentationContent (must be kept up to date if changed in parser)
        const validNests = context.tagInfo?.validNests ?? [];
        newString = newString.replaceAll("$validNestList", validNests.join(", "));

        // $validNestExample -> the first element of validNestList
        newString = newString.replaceAll("$validNestExample", validNests[0].slice(1, -1)); // .slice removes < and > (for writing closing tag as </$validNestExample>)
    }

    // $tag -> the tag name (done at the end to avoid other references being overwritten)
    newString = newString.replaceAll("$tag", context.tagInfo?.name ?? "");

    return newString;
}

// Helper function for making long code segments nicer to edit (no repeated \n's and isCode: true + automatic linking)
function mapToCodeSegment(code: string[]): DocStringSegment[] {
    return code.map((tx, i) => {
        return {
            tx: tx + "\n", // Slightly neater whitespace formatting (css wasn't working ;-;)
            isCode: true,
            link: tx.trimStart()[0] == "<" ? tx.trim().split(" ")[0].replaceAll(/[<>!/]/g, "") : undefined, // Links to tag if it is a tag, removing < > ! and /
        };
    });
}

// ALL DOCUMENTATION PAGE CONTENT IS DEFINED BELOW
export function searchPresentInDocPage(content: DocPageTree, search: string): boolean {
    const formattedSearch = search.trim().replaceAll(/[<>!/]/g, "").toLowerCase(); // Trims whitespace and removes < and > as individual characters
    const formattedReference = searchRedirects(formattedSearch.split(" ")[0]); // For when the user searches with a parameter, such as 'colour-scheme red'. The reference only looks for the tag name.

    return (
        content.subsections.some((s) => s.reference.toLowerCase() === formattedReference) ||
        content.subsections.some((s) => s.name.toLowerCase() === formattedSearch) ||
        content.title.toLowerCase() == formattedSearch ||
        content.title.toLowerCase() == formattedSearch + "s" ||
        content.title.toLowerCase() + "s" == formattedSearch + "s"
    );
}

// Used for finding scroll position
export function matchSectionReferenceInDocPage(content: DocPageTree, search: string): string {
    const formattedSearch = search.trim().replaceAll(/[<>!/]/g, "").toLowerCase();
    const formattedReference = searchRedirects(formattedSearch.split(" ")[0]);
    const searchResult = content.subsections.find((s) =>
        s.reference.toLowerCase() === formattedReference ||
        s.name.toLowerCase() === formattedSearch);

    return searchResult ? searchResult.reference : "";
}

// Record of convinient redirects
function searchRedirects(input: string): string {
    const redirects: Record<string, string> = {
        "color": "colour-scheme",
        "colour": "colour-scheme",
        "color-scheme": "colour-scheme",

        "console": "console-output",

        "initial": "initial-python-file",

        "panel": "panel-type",

        "python": "has-python",

        "minimum": "min-requirements",
        // can be extended when needed
    };
    
    return redirects[input] ?? input;
}

export function getDocumentationContent(search: string): DocPageTree {
    const config = getParserConfig();
    const formattedSearch = search.trim().replaceAll(/[<>!/]/g, "").toLowerCase();
    const formattedReference = formattedSearch.split(" ")[0];

    // Order matches the Token Evaluator order
    const pageRecords: Record<string, (cfg: any) => DocPageTree> = {
        "nontag_home": docPage_nontag_home,
        "nontag_syntax": docPage_nontag_syntax,
        "nontag_examples": docPage_nontag_examples,
        "initial": docPage_initialFile,
        "metadata": docPage_metadata,
        "defaults": docPage_defaults,
        "step": docPage_step,
        "text": docPage_text,
        "attributes": docPage_attributes,
        "requirements": docPage_requirements,
        "hint": docPage_hint,
    }; // If a new page is added, it should also be included in SEE_MORE_SECTION defined below

    if(pageRecords[formattedReference]) {
        return pageRecords[formattedReference](config);
    }

    // If this point is reached, the search keyword didn't match a page title.
    // We do the same search but looking through the redirects list
    if(pageRecords[searchRedirects(formattedReference)]) {
        return pageRecords[searchRedirects(formattedReference)](config);
    }
    
    // Now we will search the page contents, which includes:
    // - The actual page title
    // - Every subsection's reference (what most documenation links use)
    // - Every subsection's subtitle
    for(const pageFunc of Object.values(pageRecords)) {
        const content = pageFunc(config);
        if(searchPresentInDocPage(content, search)){
            return content; // Return straight away to avoid further searches
        }
    }

    // If there's still nothing, return 'Page Not Found'.
    //console.error("Lesson File Documentation Error: Produced no results from the search '" + search + "'.");
    return docPageDefault();
}

const DOC_LINE_BREAK = {tx: "\n\n"} as DocStringSegment;
const SEE_MORE_SECTION = {
    name: "See More",
    reference: "",
    keywords: [],
    extraText: [
        {tx: "General: "},
        {tx: "Home", link: "nontag_home"}, {tx: "|"},
        {tx: "Syntax", link: "nontag_syntax"}, {tx: "|"},
        {tx: "Examples", link: "nontag_examples"},
        {tx: "\nFoundations: "},
        {tx: "Initial Python File", link: "initial"}, {tx: "|"},
        {tx: "Metadata", link: "metadata"}, {tx: "|"},
        {tx: "Defaults", link: "defaults"},
        {tx: "\nStep Content: "},
        {tx: "Step", link: "step"}, {tx: "|"},
        {tx: "Text", link: "text"}, {tx: "|"},
        {tx: "Attributes", link: "attributes"}, {tx: "|"},
        {tx: "Requirements", link: "requirements"}, {tx: "|"},
        {tx: "Hints", link: "hint"},
    ],
} as DocPageNodeSection;

function docPageDefault(): DocPageTree {
    return {
        title: "Page not found.",
        description: [
            {tx: "The selected keyword was not matched to a valid page. If this is unexpected, please report it with details of how you reached this point.\n\n"},
            {tx: "Return to Home.", link: "nontag_home"},
        ],
        subsections: [],
    };
}


//////////////////////////////////////////////////////////////////////
// BELOW ARE ALL THE FUNCTIONS FOR RETURNING DOCUMENTATION CONTENT //
////////////////////////////////////////////////////////////////////


function docPage_nontag_home(cfg: LessonParserConfiguration): DocPageTree {
    const content = {
        title: "Strype Lesson (SPyL) Markup Language Documentation",
        description: [
            {tx: "A markup language designated for the creation of integrated Python Lessons within the Strype IDE."},
            DOC_LINE_BREAK,
            {tx: "If this is your first experience creating a Lesson, read through this page for a briefing on how to build and run your first Lesson File."},
            {tx: "If you need to find a specific page, use the search bar in the bottom left, or scroll to the bottom for a list of pages."},
        ],
        subsections: [
            {
                name: "Introduction to Strype Lessons",
                reference: "nontag_intro",
                keywords: [],
                extraText: [
                    {tx: "Lessons are broken down into individual "},
                    {tx: "Steps", link: "step"},
                    {tx: " which the student will progress through as they build their Python program."},
                    DOC_LINE_BREAK,
                    {tx: "The Lesson is able to read and react to the student's code as they work on it, including console outputs. This is accessed mainly through setting "},
                    {tx: "Step Requirements", link: "requirements"},
                    {tx: " which the student must fulfill before they can proceed to the next Step."},
                    {tx: "These conditions can also be used to provide extra information when needed in the form of "},
                    {tx: "Hints.", link: "hint"},
                ],
            },
            {
                name: "Running a Lesson",
                reference: "nontag_lessondetails",
                keywords: [],
                extraText: [
                    {tx: "Students will begin the Lesson by uploading it to their Lessons list. In this list, information will be displayed for each Lesson, such as its "},
                    {tx: "Title", link: "title"},
                    {tx: " and "},
                    {tx: "Description", link: "description"},
                    {tx: ". These elements are specified within the "},
                    {tx: "Metadata Section.", link: "metadata"},
                    DOC_LINE_BREAK,
                    {tx: "By default, starting a Lesson will clear the Python editor. If an "},
                    {tx: "Initial File", link: "initial"},
                    {tx: " is specified in the Lesson File, that file will be opened. Otherwise, the Lesson will start with an empty editor."},
                    DOC_LINE_BREAK,
                    {tx: "Lessons begin on the first Step and finish once the student exits the last Step. After exiting the Lesson, the student will keep the code they have written."},
                    {tx: "If a Lesson is exited early, the student will not be able to regain their progress and will need to start the Lesson again."},
                ],
            },
            {
                name: "Writing a Lesson File",
                reference: "nontag_lessonfile",
                keywords: [],
                extraText: [
                    {tx: "The most simple Lesson File consists of a "},
                    {tx: "Metadata Section", link: "metadata"},
                    {tx: " and a number of "},
                    {tx: "Steps", link: "step"},
                    {tx: "(minimum " + cfg.MIN_LESSON_STEPS + ", maximum " + cfg.MAX_LESSON_STEPS + "). It is up to the educator to decide how much content a single Step has."},
                    DOC_LINE_BREAK,
                    {tx: "A Lesson File may also contain at least one "},
                    {tx: "Defaults Section", link: "defaults"},
                    {tx: " to initialize or modify the default values of Step "},
                    {tx: "Attributes,", link: "attributes"},
                    {tx: " setting a base style for the Lesson."},
                    DOC_LINE_BREAK,
                    {tx: "To understand how to build a Lesson File, refer to the "},
                    {tx: "Syntax", link: "syntax"},
                    {tx: " for an introduction to its syntactical components."},
                    {tx: "For ideas on where to start, try writing your first "},
                    {tx: "Step,", link: "step"},
                    {tx: " or take a look at the "},
                    {tx: "Examples", link: "nontag_examples"},
                    {tx: " for some inspiration."},
                ],
            },
            {
                name: "Testing a Lesson File",
                reference: "nontag_parser",
                keywords: [],
                extraText: [
                    {tx: "To test your Lesson File, it first must be checked by the Parser for any problems."},
                    {tx: "By clicking 'Run Parser' or 'Test Lesson' in the editor, the Parser will take the content in the text area and attempt to convert it to a Lesson."},
                    {tx: "Whilst doing so, it will produce a list of Debug Messages which vary in priority. The types of Debug Messages are as follows:"},
                    DOC_LINE_BREAK,
                    {tx: "- Fatal Error: The Parser detected a problem that caused it to terminate early. It will need to be solved before the Parser can read beyond it."},
                    {tx: "\n- Error: The Parser detected a problem that will prevent the Lesson File from functioning. It will need to be solved before the Lesson File can be run."},
                    {tx: "\n- Warning: The Parser detected a problem that it has attempted to solve."},
                    {tx: "The Lesson File will still function and can be run, but might produce irregular results if the problem isn't inspected."},
                    {tx: "\n- Suggestion: The Parser detected a coding choice that could be improved/altered, but doesn't need to be fixed."},
                    DOC_LINE_BREAK,
                    {tx: "The Lesson File can only be run as a Lesson if it produces no Errors or Fatal Errors."},
                    {tx: "When you wish to proceed to trying the Lesson yourself, click 'Test Lesson' in the bottom right."},
                    DOC_LINE_BREAK,
                    {tx: "Unless disabled, the Lesson will be run in Test Mode, which grants access to the Debug Info Panel for a Step, alongside other settings."},
                    {tx: "This panel will show a list of all the current Step's "},
                    {tx: "Requirements", link: "requirements"},
                    {tx: " and "},
                    {tx: "Hints,", link: "hint"},
                    {tx: " as well as whether they have been fulfilled."},
                    {tx: "Students running the Lesson normally will not have access to this panel, unless they open and run the Lesson through this editor"},
                    DOC_LINE_BREAK,
                    {tx: "If you suspect that a student is running the Lesson in Test Mode to cheat, check the information display in the top right."},
                    {tx: "It will be green for a normal Lesson, and orange when in Test Mode."},
                ],
            },
            {
                name: "Distributing a Lesson File",
                reference: "nontag_share",
                keywords: [],
                extraText: [
                    {tx: "When your Lesson File is ready, download it from the editor and share that file with students."},
                    {tx: "They will be able to upload the file to their own clients and run the Lesson as normal."},
                    DOC_LINE_BREAK,
                    {tx: "Note that if your Lesson makes use of an "},
                    {tx: "Initial Python File,", link: "initial-python-file"},
                    {tx: " this file be included inside the Lesson File and automatically uploaded when they start the Lesson."},
                    {tx: "They will be warned that starting a Lesson will erase the existing Python content in the IDE, as this will happen even if there is no Initial File."},
                ],
            },
            SEE_MORE_SECTION,
        ],
    } as DocPageTree;

    return content;
}

function docPage_nontag_syntax(cfg: LessonParserConfiguration): DocPageTree {
    const content = {
        title: "Syntax",
        description: [
            {tx: "Lesson Files are constructed with Tags and Text Tokens. The structuring is calculated using nested "},
            {tx: "Sections", link: "nontag_sections"},
            {tx: " to define the context of a Tag."},
        ],
        subsections: [
            {
                name: "Tags",
                reference: "nontag_tags",
                keywords: [],
                extraText: [
                    {tx: "The syntax of a tag is a keyword surrounded by the symbols '<' and '>'."},
                    {tx: "For example, the 'step' tag is written as:\n"},
                    {tx: "<step>", isCode: true},
                    DOC_LINE_BREAK,
                    {tx: "Some Tag types take an argument, which is contained inside the Tag with a space seperating it from the keyword:\n"},
                    {tx: "<step [StepNameArg]>", isCode: true},
                    DOC_LINE_BREAK,
                    {tx: "Some Tag types create a "},
                    {tx: "Section,", link: "nontag_sections"},
                    {tx: " which will need to have its area marked with an opener Tag and a closer Tag. The closer tag has a '/' symbol before the keyword:\n"},
                    {tx: " <step>\n", isCode: true},
                    {tx: "\t...[section content here]\n", isCode: true},
                    {tx: "</step>", isCode: true},
                    DOC_LINE_BREAK,
                    {tx: "The parser will trim all whitespace within a "},
                    {tx: "Text Section,", link: "nontag_sections"},
                    {tx: " which allows them to span multiple lines in the Lesson File."},
                    DOC_LINE_BREAK,
                    {tx: "The exact configuration of each Tag will be listed under its respective segment in the documentation."},
                ],
            },
            {
                name: "Sections",
                reference: "nontag_sections",
                keywords: [
                    DocKeywords.TagType_TextSection,
                    DocKeywords.TagType_DataSection,
                ],
                extraText: [
                    {tx: "Tags with either of the above labels will define their own Section, which will need to have a closer Tag at the end."},
                    {tx: "To define a "},
                    {tx: "'step'", link: "step"},
                    {tx: " Section, write an opener and closer Tag, and enter the contents of the Section in between them:"},
                    {tx: " <section-tag>\n", isCode: true},
                    {tx: "   [section content here]\n", isCode: true},
                    {tx: "</section-tag>", isCode: true},
                    DOC_LINE_BREAK,
                    {tx: "The contents of a Section depends on whether it is marked as a Text Section or a Data Section."},
                    DOC_LINE_BREAK,
                    {tx: "Text Sections will contain a string of text that will be used for a specific purpose, dependent on the Tag itself."},
                    {tx: "When reading the text, the Parser will only look for the paired closing Tag. Any other content included in the text segment will not be read as a Tag."},
                    {tx: "Here is an example using the "},
                    {tx: "'has-python'", link: "has-python"},
                    {tx: " Tag, which is used to look for Python segments in the student's code:\n"},
                    {tx: " <has-python>\n", isCode: true},
                    {tx: "   if(count == 5):\n", isCode: true},
                    {tx: "</has-python>", isCode: true},
                    DOC_LINE_BREAK,
                    {tx: "Data Sections will contain other Tags, with the range of valid Tags being dependent on context. This can include other nested Sections:\n"},
                    {tx: " <section-1>\n", isCode: true},
                    {tx: "   [section-1 content here]\n", isCode: true},
                    {tx: "   <section-2>\n", isCode: true},
                    {tx: "       [section-2 content here]\n", isCode: true},
                    {tx: "   </section-2>\n", isCode: true},
                    {tx: "   [more section-1 content here]\n", isCode: true},
                    {tx: "</section-1>", isCode: true},
                    DOC_LINE_BREAK,
                    {tx: "When the documentation mentions a Parent Section, it refers to the Section that a Tag is directly nested in:\n"},
                    {tx: " <section-1>\n", isCode: true},
                    {tx: "   <section-2>\n", isCode: true},
                    {tx: "       <tag-A>\n", isCode: true},
                    {tx: "   </section-2>\n", isCode: true},
                    {tx: "   <tag-B>\n", isCode: true},
                    {tx: "</section-1>", isCode: true},
                    DOC_LINE_BREAK,
                    {tx: "In this example, 'tag-A' has 'section-2' as their Parent Section, whilst 'tag-B' has 'section-1' as their Parent Section."},
                ],
            },
            {
                name: "Data Tags",
                reference: "nontag_datatags",
                keywords: [
                    DocKeywords.TagType_Data,
                ],
                extraText: [
                    {tx: "Tags which do not specify "},
                    {tx: "Sections", link: "nontag_sections"},
                    {tx: " are referred to as 'Data Tags'. These are used to update values which do not require long strings of text, such as numeric or boolean values:\n"},
                    {tx: " <min-requirements 3>\n", link: "min-requirements", isCode: true},
                    {tx: " <hide-expected-values true>\n", link: "hide-expected-values", isCode: true},
                    {tx: " <panel-type bar>\n", link: "panel-type", isCode: true},
                ],
            },
            {
                name: "Comment",
                reference: "#",
                tagInfo: {
                    name: "#",
                    display: TagDisplay.WithCloser,
                    validNests: [],
                },
                keywords: [
                    DocKeywords.TagType_TextSection,
                    DocKeywords.ExpectedArgs_Zero,
                    DocKeywords.ValidNest_Any,
                ],
                extraText: [
                    {tx: "Comments are specified using a Text Section. They can be written anywhere in the code."},
                    DOC_LINE_BREAK,
                    {tx: "In the case that a comment is contained within a Text Section, its contents will be excluded from the text segment when it is used."},
                    {tx: "Ensure that you are careful to remember the closer tag </#> before the Parent Section is closed."},
                ],
            },
            SEE_MORE_SECTION,
        ],
    } as DocPageTree;

    return content;
}

function docPage_nontag_examples(cfg: LessonParserConfiguration): DocPageTree {
    const content = {
        title: "Examples",
        description: [
            {tx: "Some example code snippets to use in a Lesson."},
        ],
        subsections: [
            /*{
                name: "Download Example Lesson Files",
                reference: "nontag_example_download",
                keywords: [],
                extraText: [],
            },*/
            {
                name: "Metadata Template",
                reference: "metadata_template",
                keywords: [],
                extraText: [{tx: "Click on a bold Tag to view its page.\n\n"}].concat(mapToCodeSegment([
                    "<metadata>",
                    "    <title>",
                    "        [Title Here]",
                    "    </title>",
                    "    <description>",
                    "        [Description Here]",
                    "        [Description Here]",
                    "    </description>",
                    "    <estimated-time 30>",
                    "</metadata>",
                ])),
            },
            {
                name: "Step Template (Basic)",
                reference: "step_template1",
                keywords: [],
                extraText: [{tx: "Click on a bold Tag to view its page.\n\n"}].concat(mapToCodeSegment([
                    "<step StepName>",
                    "    <text>",
                    "        [Step Text Here]",
                    "    </text>",
                    "    <attributes>",
                    "        [Attributes Here]",
                    "    </attributes>",
                    "</step>",
                ])),
            },
            {
                name: "Step Template (With Requirements)",
                reference: "step_template2",
                keywords: [],
                extraText: [{tx: "Click on a bold Tag to view its page.\n\n"}].concat(mapToCodeSegment([
                    "<step StepName>",
                    "    <text>",
                    "        [Step Text Here]",
                    "    </text>",
                    "    <attributes>",
                    "        [Attributes Here]",
                    "    </attributes>",
                    "    <requirements>",
                    "        [Requirements Here]",
                    "    </requirements>",
                    "</step>",
                ])),
            },
            {
                name: "Step Template (With Requirements and Hints)",
                reference: "step_template3",
                keywords: [],
                extraText: [{tx: "Click on a bold Tag to view its page.\n\n"}].concat(mapToCodeSegment([
                    "<step StepName>",
                    "    <text>",
                    "        [Step Text Here]",
                    "    </text>",
                    "    <attributes>",
                    "        [Attributes Here]",
                    "    </attributes>",
                    "    <requirements>",
                    "        [Requirements Here]",
                    "    </requirements>",
                    "    <hint-list>",
                    "        <hint>",
                    "            <text> [Conditional Hint] </text>",
                    "            [Requirement Here]",
                    "        </hint>",
                    "        <hint>",
                    "            <text> [Base Hint] </text>",
                    "        </hint>",
                    "    </hint-list>",
                    "</step>",
                ])),
            },
            {
                name: "Step Example (Run Code)",
                reference: "step_template1",
                keywords: [],
                extraText: [{tx: "Click on a bold Tag to view its page.\n\n"}].concat(mapToCodeSegment([
                    "<step StepRunCode>",
                    "    <text>",
                    "        Now run your code.",
                    "    </text>",
                    "    <attributes>",
                    "        <panel-type right-popup>",
                    "        <colour-scheme orange>",
                    "    </attributes>",
                    "    <requirements>",
                    "        <run-code>",
                    "    </requirements>",
                    "</step>",
                ])),
            },
            SEE_MORE_SECTION,
        ],
    } as DocPageTree;

    return content;
}

function docPage_initialFile(cfg: LessonParserConfiguration): DocPageTree {
    const content = {
        title: "Initial Python File",
        description: [
            {tx: "Used to have a template Python/Strype File be uploaded to the editor upon starting the "},
            {tx: "Lesson.", link: "nontag_lesson"},
            {tx: "By attaching either a Python File or a Strype Project File as an 'Initial Python File' in the Lesson File Editor,"},
            {tx: " it will be stored in the Lesson File to be automatically opened upon starting that Lesson."},
            {tx: "Note that this should only be done through the Lesson File Editor, and should not be attempted manually."},
            DOC_LINE_BREAK,
            {tx: "The uploaded file has a maximum size of " + Math.floor(cfg.MAX_INITIAL_PYTHON_SIZE_BYTES / 1024) + "KB."},
            {tx: "It is unadvisable to start a Lesson with more code than this."},
            {tx: "In the case that a larger file happens to be needed, ask the students to copy in the code after starting the Lesson."},
        ],
        subsections: [
            {
                name: "Section Specification",
                reference: "initial-python-file",
                tagInfo: {
                    name: "initial-python-file",
                    display: TagDisplay.WithCloserArg,
                    validNests: [],
                },
                keywords: [
                    DocKeywords.Rule_Automated,
                    DocKeywords.TagType_DataSection,
                    DocKeywords.ExpectedArgs_One,
                    DocKeywords.ArgType_StringFixedSet,
                    DocKeywords.ValidNest_Base,
                    DocKeywords.Rule_Unique,
                ],
                extraText: [
                    {tx: "Specifies the area of the Initial Python File's content to be uploaded."},
                    DOC_LINE_BREAK,
                    {tx: "Do not attempt to use this Tag manually. If you wish to attach an Initial File, make use of the Lesson File Editor."},
                ],
            },
            SEE_MORE_SECTION,
        ],
    } as DocPageTree;

    return content;
}

function docPage_metadata(cfg: LessonParserConfiguration): DocPageTree {
    const content = {
        title: "Lesson Metadata",
        description: [
            {tx: "Used to specify all information about a "},
            {tx: "Lesson File", link: "nontag_lessonfile"},
            {tx: " that isn't relevant to its actual content."},
            {tx: "These details will be seen by the student and should give them an idea of what to expect from a Lesson."},
            DOC_LINE_BREAK,
            {tx: "The minimum requirement for a functional Lesson File is a valid "},
            {tx: "Title", link: "title"},
            {tx: " and "},
            {tx: "Description,", link: "description"},
            {tx: " but there are other customisable aspects that can be displayed. Required Tags will be prioritised in the sorting of Tags below."},
        ],
        subsections: [
            {
                name: "Section Specification",
                reference: "metadata_spec",
                tagInfo: {
                    name: "metadata",
                    display: TagDisplay.WithCloser,
                    validNests: [],
                },
                keywords: [
                    DocKeywords.TagType_DataSection,
                    DocKeywords.ExpectedArgs_Zero,
                    DocKeywords.ValidNest_Base,
                    ...(cfg.ALLOW_MULTIPLE_METADATA_SECTIONS ? [] : [DocKeywords.Rule_Unique]), // Conditional to config setup
                    DocKeywords.Rule_Required,
                ],
                extraText: [
                    {tx: "Contains all Metadata Tags, listed below."},
                ],
            },
            {
                name: "Description",
                reference: "description",
                tagInfo: {
                    name: "description",
                    display: TagDisplay.WithCloser,
                    validNests: ["<metadata>", ...(cfg.ALLOW_METADATA_IN_ROOT ? [] : ["Base (no parent section)"])],
                },
                keywords: [
                    DocKeywords.TagType_TextSection,
                    DocKeywords.ExpectedArgs_Zero,
                    DocKeywords.ValidNest_List,
                    DocKeywords.Rule_Unique,
                    DocKeywords.Rule_Required,
                ],
                extraText: [
                    {tx: "Defines the Description of a Lesson File, which is displayed in the Lesson Selection menu."},
                    {tx: "Has a maximum accepted length of " + cfg.MAX_LENGTH_DESCRIPTION + " characters."},
                ],
            },
            {
                name: "Title",
                reference: "title",
                tagInfo: {
                    name: "title",
                    display: TagDisplay.WithCloser,
                    validNests: ["<metadata>", ...(cfg.ALLOW_METADATA_IN_ROOT ? [] : ["Base (no parent section)"])],
                },
                keywords: [
                    DocKeywords.TagType_TextSection,
                    DocKeywords.ExpectedArgs_Zero,
                    DocKeywords.ValidNest_List,
                    DocKeywords.Rule_Unique,
                    DocKeywords.Rule_Required,
                ],
                extraText: [
                    {tx: "Defines the Title of a Lesson File, which is displayed in the Lesson Selection menu, as well as in an info popup during the Lesson."},
                    {tx: "Has a maximum accepted length of " + cfg.MAX_LENGTH_TITLE + " characters."},
                ],
            },
            {
                name: "Difficulty",
                reference: "difficulty",
                tagInfo: {
                    name: "difficulty",
                    display: TagDisplay.WithArg,
                    validNests: ["<metadata>", ...(cfg.ALLOW_METADATA_IN_ROOT ? [] : ["Base (no parent section)"])],
                },
                keywords: [
                    DocKeywords.TagType_Data,
                    DocKeywords.ExpectedArgs_One,
                    DocKeywords.ArgType_StringFixedSet,
                    DocKeywords.ValidNest_List,
                    DocKeywords.Rule_Unique,
                ],
                extraText: [
                    {tx: "Used to contrast the difficulty levels of different Lesson Files, with multiple types of difficulty scales available to choose from."},
                    {tx: "Has no effect on the actual Lesson content."},
                ],
            },
            {
                name: "Estimated Time",
                reference: "estimated-time",
                tagInfo: {
                    name: "estimated-time",
                    display: TagDisplay.WithArg,
                    validNests: ["<metadata>", ...(cfg.ALLOW_METADATA_IN_ROOT ? [] : ["Base (no parent section)"])],
                },
                keywords: [
                    DocKeywords.TagType_Data,
                    DocKeywords.ExpectedArgs_One,
                    DocKeywords.ArgType_PositiveInteger,
                    DocKeywords.ValidNest_List,
                    DocKeywords.Rule_Unique,
                ],
                extraText: [
                    {tx: "Defines an estimation for the amount of Minutes needed to complete the Lesson."},
                    {tx: "Has no effect on the actual Lesson content."},
                    {tx: "\n"},
                    {tx: "This value is determined by the programmer, and not automatically calculated."},
                    {tx: "Individual Step completion times may vary, so try going through the Lesson yourself for a good estimation."},
                ],
            },
            {
                name: "Example Usage",
                reference: "",
                keywords: [],
                extraText: [{tx: "Click on a bold Tag to view its page.\n\n"}].concat(mapToCodeSegment([
                    "<metadata>",
                    "    <title>",
                    "        Lesson Title.",
                    "    </title>",
                    "    <description>",
                    "        This is a demonstration of Lesson Metadata.",
                    "    </description>",
                    "    <difficulty 3-star>",
                    "    <estimated-time 15>",
                    "    <#> 15 minutes estimated time to complete. </#>",
                    "</metadata>",
                ])),
            },
            SEE_MORE_SECTION,
        ],
    } as DocPageTree;

    return content;
}

function docPage_defaults(cfg: LessonParserConfiguration): DocPageTree {
    const content = {
        title: "Default Attribute Values",
        description: [
            {tx: "A Defaults section is used to overwrite default values for "},
            {tx: "Step Attributes,", link: "attributes"},
            {tx: " which will be applied to every "},
            {tx: "Step", link: "step"},
            {tx: " specified after it."},
            DOC_LINE_BREAK,
            {tx: "These values will only apply to Steps which do not have their own respective Attribute Tag overwriting it."},
            {tx: "The priority is { Parser Default Value -> <defaults> Section Value -> Step <attributes> Value }."},
            {tx: "For example, a Defaults section can be used to set the "},
            {tx: "Colour Scheme", link: "colour-scheme"},
            {tx: " of all Steps to blue. This will apply to all Steps by default, except the ones with their own <colour-scheme> Tag."},
            DOC_LINE_BREAK,
            {tx: "Multiple Defaults sections can be present in a single "},
            {tx: "Lesson File,", link: "nontag_lessonfile"},
            {tx: " and each will only apply to every Step written AFTER it."},
        ],
        subsections: [
            {
                name: "Section Specification",
                reference: "defaults_spec",
                tagInfo: {
                    name: "defaults",
                    display: TagDisplay.WithCloser,
                    validNests: [],
                },
                keywords: [
                    DocKeywords.TagType_DataSection,
                    DocKeywords.ExpectedArgs_Zero,
                    DocKeywords.ValidNest_Base,
                ],
                extraText: [
                    {tx: "Takes all "},
                    {tx: "Step Attributes", link: "attributes"},
                    {tx: " as its content, applying the specified Tags to all proceeding Steps which do not have their own value."},
                ],
            },
            {
                name: "Example Usage",
                reference: "",
                keywords: [],
                extraText: [{tx: "Click on a bold Tag to view its page.\n\n"}].concat(mapToCodeSegment([
                    "<defaults>",
                    "    <colour-scheme red>",
                    "</defaults>",
                    "",
                    "<step Step 1>",
                    "    <text>",
                    "        This Step is red because of Defaults.",
                    "   </text>",
                    "</step>",
                    "",
                    "<step Step 2>",
                    "    <text>",
                    "        This Step is blue because of its Attributes.",
                    "   </text>",
                    "    <attributes>",
                    "        <colour-scheme red>",
                    "    </attributes>",
                    "</step>",
                ])),
            },
            SEE_MORE_SECTION,
        ],
    } as DocPageTree;

    return content;
}

function docPage_step(cfg: LessonParserConfiguration): DocPageTree {
    const content = {
        title: "Steps",
        description: [
            {tx: "Steps are the building blocks of all "},
            {tx: "Lessons,", link: "nontag_intro"},
            {tx: " breaking down the respective Python project into more understandable chunks."},
            {tx: "Each Step is defined as its own Section, containing all information specific to that Step."},
            DOC_LINE_BREAK,
            {tx: "The minimum requirement for a functional Step is a valid "},
            {tx: "Text Section.", link: "text"},
            {tx: " However, a Step can also have an "},
            {tx: "Attributes Section,", link: "attributes"},
            {tx: " a list of Step "},
            {tx: "Requirements,", link: "requirements"},
            {tx: " and a list of "},
            {tx: "Hints.", link: "hint"},
        ],
        subsections: [
            {
                name: "Section Specification",
                reference: "step_spec",
                tagInfo: {
                    name: "step",
                    display: TagDisplay.WithCloserArg,
                    validNests: [],
                },
                keywords: [
                    DocKeywords.TagType_DataSection,
                    DocKeywords.ExpectedArgs_One,
                    DocKeywords.ArgType_StringAny,
                    DocKeywords.ValidNest_Base,
                    DocKeywords.Rule_Required,
                ],
                extraText: [
                    {tx: "Takes a name as an argument, which will be used to display the location of problems in "},
                    {tx: "Debug Messages", link: "nontag_parser"},
                    {tx: " when running the Lesson File parser. The student will not be able to see this value."},
                    {tx: "Argument input is limited to " + cfg.MAX_LENGTH_STEPREF + " characters, and every Step name must be unique."},
                ],
            },
            {
                name: "Section Contents",
                reference: "",
                keywords: [],
                extraText: [
                    {tx: "The following Sections can be nested inside a Step:\n- "},
                    {tx: "Text", link: "text"},
                    {tx: " (required): Specifies the main text content to display on the Step's display panel.\n- "},
                    {tx: "Attributes", link: "attributes"},
                    {tx: ": Its contents are used to modify variables related to the Step.\n- "},
                    {tx: "Requirements", link: "text"},
                    {tx: ": Its contents set conditions that must be fulfilled before the student can progress to the next Step.\n- "},
                    {tx: "Hints", link: "hint"},
                    {tx: ": Used to define extra conditional messages for guiding students when they are stuck."},
                ],
            },
            {
                name: "Example Usage",
                reference: "",
                keywords: [],
                extraText: [{tx: "Click on a bold Tag to view its page.\n\n"}].concat(mapToCodeSegment([
                    "<step Step 1>",
                    "    <text>",
                    "        This is the first Step.",
                    "    </text>",
                    "</step>",
                    "",
                    "<step Step 2>",
                    "    <text>",
                    "        This is the second Step with a different colour.",
                    "    </text>",
                    "    <attributes>",
                    "        <colour-scheme red>",
                    "    </attributes>",
                    "</step>",
                ])),
            },
            SEE_MORE_SECTION,
        ],
    } as DocPageTree;

    return content;
}

function docPage_text(cfg: LessonParserConfiguration): DocPageTree {
    const content = {
        title: "Text",
        description: [
            {tx: "The most important component of a "},
            {tx: "Step", link: "step"},
            {tx: " is the Text, guiding the student on what to do next."},
            {tx: "It will be displayed as the main focus of each Step's panel."},
            DOC_LINE_BREAK,
            {tx: "Text content has a limit of " + cfg.MAX_LENGTH_STEP_TEXT + " characters for each Step."},
            {tx: "However, text segments over ~300 characters are likely to overflow the Step's panel and create a scrollbar, depending on the size set by the chosen "},
            {tx: "Panel Type.", link: "panel-type"},
        ],
        subsections: [
            {
                name: "Text in Hint",
                reference: "text_inHint",
                keywords: [],
                extraText: [
                    {tx: "This Tag is also used for setting the Text Content for individual "},
                    {tx: "Hints", link: "hint"},
                    {tx: "Inside a Step. The size limit is shortened to " + cfg.MAX_LENGTH_HINT_TEXT + " characters due to the pop-up message box being smaller."},
                    DOC_LINE_BREAK,
                    {tx: "The Text Tag will detect which context it is being used for based on its Parent Section."},
                    {tx: "If it is inside a Hint, it will update the Text for that Hint. Otherwise, it will update the Step's Text."},
                ],
            },
            {
                name: "Section Specification",
                reference: "text_spec",
                tagInfo: {
                    name: "text",
                    display: TagDisplay.WithCloser,
                    validNests: ["<step>", "<hint>"],
                },
                keywords: [
                    DocKeywords.TagType_TextSection,
                    DocKeywords.ExpectedArgs_Zero,
                    DocKeywords.ValidNest_List,
                    DocKeywords.Rule_Unique,
                    DocKeywords.Rule_Required,
                ],
                extraText: [
                    {tx: "Stores the respective Text Content as the Step's Text, or as a "},
                    {tx: "Hint's", link: "hint"},
                    {tx: " Text if nested inside one."},
                ],
            },
            SEE_MORE_SECTION,
        ],
    } as DocPageTree;

    return content;
}

function docPage_attributes(cfg: LessonParserConfiguration): DocPageTree {
    const content = {
        title: "Step Attributes",
        description: [
            {tx: "Attributes cover all customisable aspects relating to a single "},
            {tx: "Step", link: "step"},
            {tx: " that aren't handled by the other main Sections."},
            {tx: "The Attribute Tags range in argument type and what that argument affects. These will all be listed further below."},
            DOC_LINE_BREAK,
            {tx: "Each Attribute Tag has a displayed Default Value, which the Step will default to when the Tag is not present."},
            {tx: "These values are only used if they have not been changed by a "},
            {tx: "Defaults Section.", link: "defaults"},
            DOC_LINE_BREAK,
            {tx: "To avoid needing to write the same Attribute Tag in every Step, the Defaults Section can be used to modify the default value of specific Attributes."},
            {tx: "Changes made in a Defaults Section will apply to all subsequent Steps, until another Defaults Section overrides it."},
            {tx: "Individual Steps are also able to override values specified in Defaults Sections with their own Attribute Tag, which will be prioritised."},
            DOC_LINE_BREAK,
            {tx: "There is no limit to the amount of total Attributes in a single Step. However, all distinct Attribute Tags will either be Unique, or have their own set limit."},
        ],
        subsections: [
            {
                name: "Section Specification",
                reference: "attributes_spec",
                tagInfo: {
                    name: "attributes",
                    display: TagDisplay.WithCloser,
                    validNests: ["<step>"],
                },
                keywords: [
                    DocKeywords.TagType_DataSection,
                    DocKeywords.ExpectedArgs_Zero,
                    DocKeywords.ValidNest_List,
                    ...(cfg.ALLOW_MULTIPLE_STEP_SUBSECTIONS ? [] : [DocKeywords.Rule_Unique]), // Conditional to config setup
                ],
                extraText: [
                    {tx: "Contains all Attribute Tags, listed below."},
                ],
            },
            {
                name: "Colour Scheme",
                reference: "colour-scheme",
                tagInfo: {
                    name: "colour-scheme",
                    display: TagDisplay.WithArg,
                    validNests: ["<attributes>", "<defaults>", ...(cfg.ALLOW_ATTRIBUTES_IN_STEP_NEST ? ["<step>"] : [])],
                },
                keywords: [
                    DocKeywords.TagType_Data,
                    DocKeywords.ExpectedArgs_One,
                    DocKeywords.ArgType_StringFixedSet,
                    DocKeywords.ValidNest_List,
                    DocKeywords.Rule_Unique,
                ],
                extraText: [
                    {tx: "Defines the general colour scheme of the Step's display panel."},
                    {tx: "Recommended to be used in a "},
                    {tx: "Defaults Section", link: "defaults"},
                    {tx: " to specify a colour theme for the entire Lesson, allowing easy identification when multiple Lessons are being run by different students."},
                    {tx: "\n\nDefault Value: 'green'."},
                ],
            },
            {
                name: "Hide Expected Requirement Values?",
                reference: "hide-expected-values",
                tagInfo: {
                    name: "hide-expected-values",
                    display: TagDisplay.WithArg,
                    validNests: ["<attributes>", "<defaults>", ...(cfg.ALLOW_ATTRIBUTES_IN_STEP_NEST ? ["<step>"] : [])],
                },
                keywords: [
                    DocKeywords.TagType_Data,
                    DocKeywords.ExpectedArgs_Boolean,
                    DocKeywords.ArgType_Boolean,
                    DocKeywords.ValidNest_List,
                    DocKeywords.Rule_Unique,
                ],
                extraText: [
                    {tx: "When a "},
                    {tx: "Step Requirement", link: "requirements"},
                    {tx: " has not been met, it will display a message to tell the student what they need to do, including the exact values needed where relevant."},
                    {tx: "Setting this Attribute to true will hide these values, instead only vaguely informing the student of what they need to do."},
                    {tx: "For example, a Step with the "},
                    {tx: "has-python Requirement", link: "has-python"},
                    {tx: " will no longer reveal the Python segment it is looking for to the student."},
                    {tx: "\nIf this is set to true, ensure that the Step can still be solved with the information given in its "},
                    {tx: "Text", link: "text"},
                    {tx: " and its "},
                    {tx: "Hints.", link: "hint"},
                    {tx: "\n\nDefault Value: false."},
                ],
            },
            {
                name: "Minimum Step Requirements",
                reference: "min-requirements",
                tagInfo: {
                    name: "min-requirements",
                    display: TagDisplay.WithArg,
                    validNests: ["<attributes>", "<defaults>", ...(cfg.ALLOW_ATTRIBUTES_IN_STEP_NEST ? ["<step>"] : [])],
                },
                keywords: [
                    DocKeywords.TagType_Data,
                    DocKeywords.ExpectedArgs_One,
                    DocKeywords.ArgType_PositiveInteger,
                    DocKeywords.ValidNest_List,
                    DocKeywords.Rule_Unique,
                ],
                extraText: [
                    {tx: "Defines the minimum number of "},
                    {tx: "Step Requirements", link: "requirements"},
                    {tx: " needed for the student to progress to the next Step."},
                    {tx: "If not specified, the Step's default behaviour will be to enforce all Step Requirements."},
                    {tx: "\nThe argument value must be between 1 and the total number of Step Requirements inclusive."},
                    {tx: "\n\nDefault Value: total amount of Requirements in this Step (all must be fulfilled)."},
                ],
            },
            {
                name: "Panel Tall?",
                reference: "panel-tall",
                tagInfo: {
                    name: "panel-tall",
                    display: TagDisplay.WithArg,
                    validNests: ["<attributes>", "<defaults>", ...(cfg.ALLOW_ATTRIBUTES_IN_STEP_NEST ? ["<step>"] : [])],
                },
                keywords: [
                    DocKeywords.TagType_Data,
                    DocKeywords.ExpectedArgs_Boolean,
                    DocKeywords.ArgType_Boolean,
                    DocKeywords.ValidNest_List,
                    DocKeywords.Rule_Unique,
                ],
                extraText: [
                    {tx: "Increases the height of a Step Panel by ~40%, allowing more "},
                    {tx: "Text", link: "text"},
                    {tx: " content to be displayed."},
                    {tx: "\n\nDefault Value: false."},
                ],
            },
            {
                name: "Panel Type",
                reference: "panel-type",
                tagInfo: {
                    name: "panel-type",
                    display: TagDisplay.WithArg,
                    validNests: ["<attributes>", "<defaults>", ...(cfg.ALLOW_ATTRIBUTES_IN_STEP_NEST ? ["<step>"] : [])],
                },
                keywords: [
                    DocKeywords.TagType_Data,
                    DocKeywords.ExpectedArgs_One,
                    DocKeywords.ArgType_StringFixedSet,
                    DocKeywords.ValidNest_List,
                    DocKeywords.Rule_Unique,
                ],
                extraText: [
                    {tx: "Defines the shape, size and position of the Step's panel, being an option from a set of premade templates."},
                    {tx: "The choice comes down to context, the total "},
                    {tx: "Text", link: "text"},
                    {tx: " content, and preference. Some templates come with restrictions, listed below:"},
                    DOC_LINE_BREAK,
                    {tx: "Argument 'central-focus' dims the screen and creates a central message for the student to read. As this interface blocks access to the editor, it cannot have any "},
                    {tx: "Step Requirements", link: "requirements"},
                    {tx: " that could have the student stuck in an unsolvable situation."},
                    {tx: "\n\nDefault Value: 'popup-left'."},
                ],
            },
            {
                name: "Example Usage",
                reference: "",
                keywords: [],
                extraText: [{tx: "Click on a bold Tag to view its page.\n\n"}].concat(mapToCodeSegment([
                    "<step Step 1>",
                    "    <text>",
                    "        This Step is red and on the right.",
                    "    </text>",
                    "    <attributes>",
                    "        <panel-type popup-right>",
                    "        <colour-scheme red>",
                    "    </attributes>",
                    "</step>",
                ])),
            },
            SEE_MORE_SECTION,
        ],
    } as DocPageTree;

    return content;
}

function docPage_requirements(cfg: LessonParserConfiguration): DocPageTree {
    const content = {
        title: "Requirements",
        description: [
            {tx: "Requirements are used to specify conditions that need to be met during a "},
            {tx: "Step.", link: "step"},
            {tx: "They can be used to enforce a task for the student to complete before they can continue to the next Step, and can also be used to conditionally display "},
            {tx: "Hints.", link: "step"},
            DOC_LINE_BREAK,
            {tx: "Most Requirement types involve a counter to track the progress towards its completion."},
            {tx: "It is important to note that these counters will reset upon "},
            {tx: "Unlocking a Step,", link: "nontag_unlockstep"},
            {tx: " ensuring that the progress for a Requirement only applies to the Step it is attached to."},
            DOC_LINE_BREAK,
            {tx: "Steps are limited to " + cfg.MAX_REQUIREMENTS_PER_STEP + " Requirements. However, most Requirement Tags are Unique, so this limit is hard to reach."},
        ],
        subsections: [
            {
                name: "'Unlocking' a Step",
                reference: "nontag_unlockstep",
                keywords: [],
                extraText: [
                    {tx: "Upon starting a Lesson, only the first Step will be accessible, and the rest of the Steps will be 'locked' until they are reached."},
                    {tx: "If the current Step has no Requirements, then the student can unlock the next Step by simply going to it."},
                    {tx: "When a Step does have Requirements, they must be fulfilled in order to unlock the next Step. Once they have been met, the student can progress."},
                    DOC_LINE_BREAK,
                    {tx: "By default, Steps expect all of their Requirements to be fulfilled to allow the student to progress."},
                    {tx: "To modify this setting, make use of the "},
                    {tx: "Minimum Requirements", link: "min-requirements"},
                    {tx: " Attribute."},
                ],
            },
            {
                name: "Requirements in Hints",
                reference: "requirements_inHint",
                keywords: [
                    DocKeywords.Rule_Unique,
                ],
                extraText: [
                    {tx: "Requirements can be used to enable or disable "},
                    {tx: "Hints", link: "hint"},
                    {tx: " being shown when clicking the Hint Button."},
                    {tx: "The Hint displayed is chosen as the first Step with all Requirements fulfilled, ordered from top to bottom in the Step's markup."},
                    {tx: "Refer to the "},
                    {tx: "Examples", link: "nontag_examples"},
                    {tx: " to see this in use."},
                ],
            },
            {
                name: "Requirement Negation",
                reference: "nontag_negation",
                tagInfo: {
                    name: "!tag",
                    display: TagDisplay.Plain,
                    validNests: [],
                },
                keywords: [],
                extraText: [
                    {tx: "Requirement Tags can have their status negated with use of a Negation Symbol '!' being written before the Tag keyword."},
                    {tx: "This will inverse the condition of the Requirement, marking it as true when it is NOT fulfilled and vice versa."},
                    {tx: "For example, the "},
                    {tx: "'run-code'", link: "run-code"},
                    {tx: " Requirement waits for the student to run their program, being set to true once they do:\n"},
                    {tx: "<run-code>", isCode: true},
                    DOC_LINE_BREAK,
                    {tx: "The Negation of this Requirement Tag will work the other way round, starting as true and being set to false once the student runs their code:\n"},
                    {tx: "<!run-code>", isCode: true},
                    DOC_LINE_BREAK,
                    {tx: "Since the Requirement status only refreshes upon entering a new Step, many Negations of Requirements are ONLY allowed to be used for "},
                    {tx: "Hints,", link: "hint"},
                    {tx: " preventing Steps from being locked behind unsolvable conditions."},
                ],
            },
            {
                name: "Section Specification",
                reference: "requirements_spec",
                tagInfo: {
                    name: "requirements",
                    display: TagDisplay.WithCloser,
                    validNests: ["<step>", "<hint>"],
                },
                keywords: [
                    DocKeywords.TagType_DataSection,
                    DocKeywords.ExpectedArgs_Zero,
                    DocKeywords.ValidNest_List,
                    ...(cfg.ALLOW_MULTIPLE_STEP_SUBSECTIONS ? [] : [DocKeywords.Rule_Unique]), // Conditional to config setup
                ],
                extraText: [
                    {tx: "Contains all Requirement Tags, listed below."},
                ],
            },
            {
                name: "Changes Made",
                reference: "changes-made",
                tagInfo: {
                    name: "changes-made",
                    display: TagDisplay.WithNegation,
                    validNests: ["<requirements>", "<hint>", ...(cfg.ALLOW_REQUIREMENTS_IN_STEP_NEST ? ["<step>"] : [])],
                },
                keywords: [
                    DocKeywords.TagType_Data,
                    DocKeywords.ExpectedArgs_Zero,
                    DocKeywords.ValidNest_List,
                    DocKeywords.Rule_Unique,
                    DocKeywords.Rule_ReqNegationBlocked,
                ],
                extraText: [
                    {tx: "Checks whether the student has made any change at all to their code since first opening the Step."},
                    DOC_LINE_BREAK,
                    {tx: "Regular Condition: True iff student has made changes to their code since "},
                    {tx: "unlocking the Step.", link: "nontag_unlockstep"},
                ],
            },
            {
                name: "Console Output",
                reference: "console-output",
                tagInfo: {
                    name: "console-output",
                    display: TagDisplay.WithNegationCloser,
                    validNests: ["<requirements>", "<hint>", ...(cfg.ALLOW_REQUIREMENTS_IN_STEP_NEST ? ["<step>"] : [])],
                },
                keywords: [
                    DocKeywords.TagType_TextSection,
                    DocKeywords.ExpectedArgs_Zero,
                    DocKeywords.ValidNest_List,
                ],
                extraText: [
                    {tx: "Uses a "},
                    {tx: "Text Section", link: "nontag_sections"},
                    {tx: " to specifiy a text segment that must be present in the code's console output."},
                    {tx: "It is recommended to pair this with the "},
                    {tx: "<run-code> Requirement", link: "run-code"},
                    {tx: " to ensure that the console output is up to date."},
                    DOC_LINE_BREAK,
                    {tx: "Regular Condition: True iff student's console output contains the specified string."},
                ],
            },
            {
                name: "Failed Next Attempts",
                reference: "failed-attempts",
                tagInfo: {
                    name: "failed-attempts",
                    display: TagDisplay.WithNegationArg,
                    validNests: ["<hint>", "<requirements>"],
                },
                keywords: [
                    DocKeywords.TagType_Data,
                    DocKeywords.ExpectedArgs_One,
                    DocKeywords.ArgType_PositiveInteger,
                    DocKeywords.ValidNest_List,
                    DocKeywords.Rule_Unique,
                    DocKeywords.Rule_ReqHintExclusive,
                ],
                extraText: [
                    {tx: "Tracks the amount of times a student clicks the 'Next Step' button whilst having unfulfilled Step Requirements."},
                    DOC_LINE_BREAK,
                    {tx: "This Requirement Type can only be used for "},
                    {tx: "Hints,", link: "hint"},
                    {tx: " allowing extra information to be accessibly only when the student is stuck."},
                    {tx: "The minimum 'failed attempts' needed for this Requirement to be fulfilled is dependent on the argument given."},
                    DOC_LINE_BREAK,
                    {tx: "Regular Condition: True iff student has tried and failed to progress to the next Step at least N times."},
                ],
            },
            {
                name: "No Errors",
                reference: "no-errors",
                tagInfo: {
                    name: "no-errors",
                    display: TagDisplay.WithNegation,
                    validNests: ["<requirements>", "<hint>", ...(cfg.ALLOW_REQUIREMENTS_IN_STEP_NEST ? ["<step>"] : [])],
                },
                keywords: [
                    DocKeywords.TagType_Data,
                    DocKeywords.ExpectedArgs_Zero,
                    DocKeywords.ValidNest_List,
                    DocKeywords.Rule_Unique,
                ],
                extraText: [
                    {tx: "Checks whether the student's code has any errors."},
                    DOC_LINE_BREAK,
                    {tx: "Regular Condition: True iff student has no errors present in their code."},
                ],
            },
            {
                name: "Has Python Segment",
                reference: "has-python",
                tagInfo: {
                    name: "has-python",
                    display: TagDisplay.WithNegationCloser,
                    validNests: ["<requirements>", "<hint>", ...(cfg.ALLOW_REQUIREMENTS_IN_STEP_NEST ? ["<step>"] : [])],
                },
                keywords: [
                    DocKeywords.TagType_TextSection,
                    DocKeywords.ExpectedArgs_Zero,
                    DocKeywords.ValidNest_List,
                ],
                extraText: [
                    {tx: "Uses a "},
                    {tx: "Text Section", link: "nontag_sections"},
                    {tx: " to specifiy a Python Code String to match inside the student's code."},
                    DOC_LINE_BREAK,
                    {tx: "Regular Condition: True iff student's code has at least one instance of the Python string."},
                ],
            },
            {
                name: "Run Code",
                reference: "run-code",
                tagInfo: {
                    name: "run-code",
                    display: TagDisplay.WithNegation,
                    validNests: ["<requirements>", "<hint>", ...(cfg.ALLOW_REQUIREMENTS_IN_STEP_NEST ? ["<step>"] : [])],
                },
                keywords: [
                    DocKeywords.TagType_Data,
                    DocKeywords.ExpectedArgs_Zero,
                    DocKeywords.ValidNest_List,
                    DocKeywords.Rule_Unique,
                    DocKeywords.Rule_ReqNegationBlocked,
                ],
                extraText: [
                    {tx: "Checks whether the student has ran their code since first opening the Step. It does not matter whether the code returns errors or has content."},
                    DOC_LINE_BREAK,
                    {tx: "Regular Condition: True iff student has clicked the 'Run' button since "},
                    {tx: "unlocking the Step.", link: "nontag_unlockstep"},
                ],
            },
            {
                name: "Time Passed",
                reference: "time-passed",
                tagInfo: {
                    name: "time-passed",
                    display: TagDisplay.WithNegationArg,
                    validNests: ["<requirements>", "<hint>", ...(cfg.ALLOW_REQUIREMENTS_IN_STEP_NEST ? ["<step>"] : [])],
                },
                keywords: [
                    DocKeywords.TagType_Data,
                    DocKeywords.ExpectedArgs_One,
                    DocKeywords.ArgType_PositiveInteger,
                    DocKeywords.ValidNest_List,
                    DocKeywords.Rule_Unique,
                    DocKeywords.Rule_ReqNegationBlocked,
                ],
                extraText: [
                    {tx: "Starts a timer the moment the student reaches a new Step, waiting until the time passed N seconds."},
                    DOC_LINE_BREAK,
                    {tx: "Regular Condition: True iff it has been at least N seconds since "},
                    {tx: "unlocking the Step.", link: "nontag_unlockstep"},
                ],
            },
            {
                name: "Example Usage",
                reference: "",
                keywords: [],
                extraText: [{tx: "Click on a bold Tag to view its page.\n\n"}].concat(mapToCodeSegment([
                    "<step Step 1>",
                    "    <text>",
                    "        This Step needs the student to run their code,",
                    "       and displays a Hint if they try to continue",
                    "       without doing so.",
                    "    </text>",
                    "    <requirements>",
                    "        <run-code>",
                    "    </requirements>",
                    "    <hint>",
                    "        <text>Try running your code</text>",
                    "        <failed-attempts 1>",
                    "    </hint>",
                    "</step>",
                ])),
            },
            SEE_MORE_SECTION,
        ],
    } as DocPageTree;

    return content;
}


function docPage_hint(cfg: LessonParserConfiguration): DocPageTree {
    const content = {
        title: "Hints",
        description: [
            {tx: "Hints are used to conditionally display extra information for students who are stuck."},
            {tx: "They consist of a message specified with a "},
            {tx: "Text", link: "text"},
            {tx: " section, and a set of up to " + cfg.MAX_REQUIREMENTS_PER_HINT},
            {tx: "Requirements", link: "requirements"},
            {tx: " to decide when the Hint should be accessible."},
            DOC_LINE_BREAK,
            {tx: "Steps", link: "step"},
            {tx: " can have up to " + cfg.MAX_HINTS_PER_STEP + " different Hints, but only one is able to be displayed at once."},
            {tx: "This is chosen to be the first Hint read with all of its Requirements fulfilled, in the order they are written in the Lesson File."},
            {tx: "A Hint with no Requirements will always be accessible, unless a different Hint defined before it has all of its conditions fulfilled."},
        ],
        subsections: [
            {
                name: "Section Specification",
                reference: "hint_spec",
                tagInfo: {
                    name: "hint",
                    display: TagDisplay.WithCloser,
                    validNests: ["<step>", "<hint-list>"],
                },
                keywords: [
                    DocKeywords.TagType_DataSection,
                    DocKeywords.ExpectedArgs_Zero,
                    DocKeywords.ValidNest_List,
                ],
                extraText: [
                    {tx: "Contains a single "},
                    {tx: "Text", link: "text"},
                    {tx: " section, and potentially a list of "},
                    {tx: "Requirements.", link: "requirements"},
                    {tx: "A Hint must contain Text content to be validated."},
                ],
            },
            {
                name: "Hint List",
                reference: "hint-list",
                tagInfo: {
                    name: "hint-list",
                    display: TagDisplay.WithCloser,
                    validNests: ["<step>"],
                },
                keywords: [
                    DocKeywords.TagType_DataSection,
                    DocKeywords.ExpectedArgs_Zero,
                    DocKeywords.ValidNest_List,
                ],
                extraText: [
                    {tx: "Can be used when a "},
                    {tx: "Step", link: "step"},
                    {tx: " has multiple Hints to group them together."},
                    {tx: "This Tag is solely for readability, and will have no effect on how the Hints are parsed and displayed."},
                ],
            },
            {
                name: "Example Usage",
                reference: "",
                keywords: [],
                extraText: [{tx: "Click on a bold Tag to view its page.\n\n"}].concat(mapToCodeSegment([
                    "<step Step 1>",
                    "    <text>",
                    "        This Step has two Hints, which each",
                    "       become available at different times.",
                    "    </text>",
                    "    <hint>",
                    "        <text>Try using an 'if' statement.</text>",
                    "        <time-passed 60>",
                    "    </hint>",
                    "    <hint>",
                    "        <text>Remember how to check conditions.</text>",
                    "        <time-passed 30>",
                    "    </hint>",
                    "</step>",
                ])),
            },
            SEE_MORE_SECTION,
        ],
    } as DocPageTree;

    return content;
}


/* FORMAT FOR NEW DOCUMENTATION PAGES
function docPage_[PAGEREFERENCE](cfg: LessonParserConfiguration): DocPageTree {
    const content = {
        title: "New Page",
        description: [
            {tx: "General Description"},
        ],
        subsections: [
            {
                name: "Subsection 1",
                reference: "reference value here",
                keywords: [],
                extraText: [
                    {tx: "Text"},
                    {tx: "Text with link", link: "link reference"},
                ],
            },
            {
                name: "Subsection 2",
                reference: "reference value here",
                tagInfo: { // For tags
                    name: "",
                    display: TagDisplay.WithArg, // Example display
                    validNests: ["<nest 1>"],
                },
                keywords: [
                    DocKeywords.Rule_Unique, // Example keyword
                ],
                extraText: [
                    {tx: "Text"},
                ],
            },
            // More subsections from here if needed
        ],
    } as DocPageTree;

    return content;
}*/