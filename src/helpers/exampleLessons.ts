// Helper file handling the loading of EXAMPLE lessons (not ones in store, as that is handled in OpenLessonDlg.vue)
// Similar design to demos.ts (as of early 2026)

import * as yaml from "js-yaml";
import { Lesson } from "@/types/types";

// Gets the example lessons from /public/lessons/
export async function getExampleLessons() : Promise<Lesson[]> {
    const dir = "./lessons/";

    // IMPORTANT NOTE: The index.yaml file is NOT affected by <metadata> sections of individual Lesson Files. 
    // In the case where an example lesson's metadata is changed, it will also need to be changed in the .yaml file, otherwise it will be incorrectly displayed.
    const text = await (await fetch(dir + "index.yaml")).text();
    const rawData = yaml.load(text) as any[];

    const lessons = [] as Lesson[];
    for (const l of rawData) {
        const lessonFileText = await (await fetch(dir + l.file)).text();

        lessons.push({
            details: {
                title: l.title,
                description: l.description,
                totalSteps: l.totalSteps,
                estimatedTime: l.estimatedTime ?? undefined,
                difficulty: l.difficulty ?? undefined,
            },
            sourceLines: lessonFileText.split("\n"),
        });   
    }
    return lessons;
}