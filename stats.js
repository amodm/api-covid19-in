import { Store } from "./store";
import { STORE_KEYS } from "./constants";
import { fetchTimestamps, successResponse } from "./api";

/**
 * Get case counts
 */
export async function getCaseCounts() {
    const tsPromise = fetchTimestamps();
    const regionalCaseCounts = await Store.get(STORE_KEYS.CASE_COUNTS, "json");

    return successResponse(createCaseCountRecord(regionalCaseCounts), tsPromise);
}

/**
 * Get case counts as a daily time series
 */
export async function getCaseCountsTimeseries() {
    const tsPromise = fetchTimestamps();

    const dayToKey = {};
    let cursor = undefined;
    while (true) {
        const keysResponse = await Store.list(STORE_KEYS.CASE_COUNTS + "/", cursor);
        for (let i=0; i<keysResponse.keys.length; i++) {
            const key = keysResponse.keys[i].name;
            const day = getDayFromRecordKey(key);
            const existingKey = dayToKey[day];
            if (!existingKey || existingKey.localeCompare(key) < 0) dayToKey[day] = key;
        }
        if (keysResponse.list_complete) break;
        else cursor = keysResponse.cursor;
    }

    const recordKeys = Object.values(dayToKey);
    const records = await Promise.all(recordKeys.map((k) => Store.get(k, "json")));

    const timeseries = [];
    for (let i=0; i<recordKeys.length; i++) {
        const recordForDay = createCaseCountRecord(records[i]);
        timeseries.push({day: getDayFromRecordKey(recordKeys[i]), ...recordForDay});
    }
    timeseries.sort((x,y) => x.day.localeCompare(y.day));

    return successResponse(timeseries, tsPromise);
}

function createCaseCountRecord(regionalCaseCounts) {
    const summaryCounts = {
        "total": 0,
        "confirmedCasesIndian": 0,
        "confirmedCasesForeign": 0,
        "discharged": 0,
        "deaths": 0
    };

    for (let i=0; i<regionalCaseCounts.length; i++) {
        summaryCounts["confirmedCasesIndian"] += regionalCaseCounts[i]["confirmedCasesIndian"];
        summaryCounts["confirmedCasesForeign"] += regionalCaseCounts[i]["confirmedCasesForeign"];
        summaryCounts["discharged"] += regionalCaseCounts[i]["discharged"];
        summaryCounts["deaths"] += regionalCaseCounts[i]["deaths"];
    }
    summaryCounts["total"] = summaryCounts["confirmedCasesIndian"] + summaryCounts["confirmedCasesForeign"];

    return { "summary": summaryCounts, "regional": regionalCaseCounts };
}

function getDayFromRecordKey(key) {
    return key.split('/')[1].substr(0, 10);
}