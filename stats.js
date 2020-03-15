import { Store } from "./store";
import { STORE_KEYS } from "./constants";
import { fetchTimestamps, successResponse } from "./api";

/**
 * Get case counts
 */
export async function getCaseCounts() {
    const tsPromise = fetchTimestamps();
    const regionalCaseCounts = await Store.get(STORE_KEYS.CASE_COUNTS, "json");
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

    return successResponse({ "summary": summaryCounts, "regional": regionalCaseCounts }, tsPromise);
}