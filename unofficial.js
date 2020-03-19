import { successResponse } from "./api";

/**
 * Get all unofficial sources
 */
export async function getAllUnofficialSources() {
    return successResponse({ "unofficialSources": ALL_UNOFFICIAL_SOURCES });
}

const COVID19INDIA_ORG = 'covid19india.org';
const ALL_UNOFFICIAL_SOURCES = [COVID19INDIA_ORG];