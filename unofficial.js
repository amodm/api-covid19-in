import { Store } from "./store";
import { STORE_KEYS } from "./constants";
import { errorResponse, fetchTimestamps, successResponse } from "./api";

/**
 * Get all unofficial sources
 */
export async function getAllUnofficialSources() {
    const tsPromise = fetchTimestamps();
    return successResponse({ "unofficialSources": ALL_UNOFFICIAL_SOURCES }, tsPromise);
}

export async function getUnofficialSource(request, path) {
    const tsPromise = fetchTimestamps();
    const arr = path.split('/');
    if (arr.length !== 3 || !ALL_UNOFFICIAL_SOURCES.includes(arr[2])) {
        return errorResponse({ reason: "invalid source" }, tsPromise, 404);
    }
    else {
        const data = await Store.get(STORE_KEYS.UNOFFICIAL_SRC_PREFIX + arr[2]);
        return successResponse(JSON.parse(data), tsPromise);
    }
}

const COVID19INDIA_ORG = 'covid19india.org';
const ALL_UNOFFICIAL_SOURCES = [COVID19INDIA_ORG];