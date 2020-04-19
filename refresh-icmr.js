import { errorResponse, rawResponse } from './api';
import { Store } from './store';
import { STORE_KEYS } from './constants';

/**
 * Fetches data from @SOURCE_URL and caches it
 */
export async function refreshTestingData(request) {
    const isDebugMode = request.url.includes("debug");
    const response = await fetch(SOURCE_URL);
    if (response.status === 200) {
        const testingData = (await response.json())["tested"];
        if (!testingData || !Array.isArray(testingData) || testingData.length === 0) {
            return await errorResponse({"error": "response not an array"});
        }

        const rawRecords = testingData.map(row => ({
            timestamp: getLastUpdated(row["updatetimestamp"]),
            totalSamplesTested: parseInt(row["totalsamplestested"]),
            totalIndividualsTested: parseInt(row["totalindividualstested"]),
            totalPositiveCases: parseInt(row["totalpositivecases"]),
            source: row["source"]
        }));

        const latestData = rawRecords[rawRecords.length-1];
        const lastRefreshed = new Date().toISOString();

        // per day history
        await Promise.all(isDebugMode ? [] : [
            // store raw history
            Store.put(STORE_KEYS.CACHED_TESTING_HISTORY_RAW, JSON.stringify({
                success: true,
                data: rawRecords,
                lastRefreshed,
                lastOriginUpdate: latestData.timestamp
            })),
            // store per day history
            Store.put(STORE_KEYS.CACHED_TESTING_HISTORY, JSON.stringify({
                success: true,
                data: getPerDayRecords(rawRecords),
                lastRefreshed,
                lastOriginUpdate: latestData.timestamp
            }))
        ]);
        return rawResponse(rawRecords);
    }
    else {
        const error = {code: response.status, status: response.statusText, body: await response.text()};
        return await errorResponse(error);
    }
}

function getPerDayRecords(rawRecords) {
    const perDayDict = {};
    for (let i=0; i<rawRecords.length; i++) {
        const day = rawRecords[i].timestamp.substring(0,10);
        perDayDict[day] = rawRecords[i];
    }
    return Object.values(perDayDict).map(x => ({
        day: x.timestamp.substring(0,10),
        totalSamplesTested: x.totalSamplesTested,
        totalIndividualsTested: x.totalIndividualsTested,
        totalPositiveCases: x.totalPositiveCases,
        source: x.source
    })).sort((x, y) => x.day.localeCompare(y.day));
}

function getLastUpdated(content) {
    const r = RegExp("(\\d+)/(\\d+)/(\\d+) (\\d{1,2})[:.](\\d{1,2})([:.]\\d{1,2})?");
    const m = content.toLowerCase().match(r);
    if (!m || m.length !== 7) {
        console.log(`invalid timestamp in ICMR data: ${content}`);
        throw `invalid timestamp in ICMR data: ${content}`;
    }

    const day = parseInt(m[1]);
    const month = parseInt(m[2])-1;
    const year = parseInt(m[3]);
    const hour = parseInt(m[4]) + (content.endsWith("pm") ? 12 : 0);
    const min = parseInt(m[5]);
    return new Date(Date.UTC(year, month, day, hour, min, 0, 0) - 330*60*1000).toISOString();
}

const SOURCE_URL = "https://api.covid19india.org/data.json";