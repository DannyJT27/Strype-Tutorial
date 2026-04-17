// Small helper function for returning a list of 'Metadata Points', being pill-shaped data points shown in the Lesson Summary

import { LessonMetadata } from "@/types/types";

type MetadataPoint = {
    content: string;
    borderColour?: string;
    bgColour?: string;
};

export function getMetadataPointsList(lessonDetails: LessonMetadata): MetadataPoint[] {
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
}