import { errorResponse, successResponse } from './api';
import { Store } from './store';
import { STORE_KEYS } from './constants';

/**
 * Fetches data from @SOURCE_URL and caches it
 */
export async function refreshHospitalBeds(request, isDebugMode) {
    const response = await fetch(SOURCE_URL);
    const content = (await response.json());
    if (response.status === 200) {
        if (!Array.isArray(content) || content.length === 0) {
            return await errorResponse({"error": "response not an array"});
        }

        const summary = {
            ruralHospitals: 0,
            ruralBeds: 0,
            urbanHospitals: 0,
            urbanBeds: 0,
            totalHospitals: 0,
            totalBeds: 0
        };
        const sources = [];
        const records = [];
        let maxTimestamp = '';
        for (let i=0; i<content.length; i++) {
            const src = content[i]["Source"];
            const recordUpdated = getLastUpdated(content[i]["LastUpdated"]);
            if (src && !sources.find(x => x.url === src)) {
                if (recordUpdated.localeCompare(maxTimestamp) > 0) maxTimestamp = recordUpdated;
                sources.push({url: src, recordUpdated});
            }
            const ruralHospitals = "RuralHospitalsCount" in content[i] ? parseInt(content[i]["RuralHospitalsCount"]) : 0;
            const ruralBeds = "RuralBeds" in content[i] ? parseInt(content[i]["RuralBeds"]) : 0;
            const urbanHospitals = "UrbanHospitals" in content[i] ? parseInt(content[i]["UrbanHospitals"]) : 0;
            const urbanBeds = "UrbanBeds" in content[i] ? parseInt(content[i]["UrbanBeds"]) : 0;
            records.push({
                state: content[i]["State"],
                ruralHospitals,
                ruralBeds,
                urbanHospitals,
                urbanBeds,
                totalHospitals: ruralHospitals + urbanHospitals,
                totalBeds: ruralBeds + urbanBeds,
                asOn: recordUpdated
            });
            summary.ruralHospitals += ruralHospitals;
            summary.ruralBeds += ruralBeds;
            summary.urbanHospitals += urbanHospitals;
            summary.urbanBeds += urbanBeds;
        }
        summary.totalHospitals = summary.ruralHospitals + summary.urbanHospitals;
        summary.totalBeds = summary.ruralBeds + summary.urbanBeds;

        const lastRefreshed = new Date().toISOString();
        const lastOriginUpdate = maxTimestamp;
        const data = {
            success: true,
            data: {summary, regional: records},
            lastRefreshed,
            lastOriginUpdate
        };

        await Store.put(STORE_KEYS.HOSPITAL_BEDS_COUNTS, JSON.stringify(data));
        return await successResponse(
            isDebugMode ? data : {  },
            Promise.all([Promise.resolve("0"), Promise.resolve("0")])
        );
    }
    else {
        const error = {code: response.status, status: response.statusText, body: content};
        return await errorResponse(error);
    }
}

function getLastUpdated(content) {
    const r = RegExp("(\\d{4}-\\d{2}-\\d{2}) (\\d{1,2}:\\d{2}:\\d{2})");
    const m = content.match(r);
    if (m.length !== 3) return "1970-01-01T00:00:00.000Z";

    const hhmmss = m[2].length===7 ? `0${m[2]}` : m[2];
    return `${m[1]}T${hhmmss}.000Z`;
}

const SOURCE_URL = "https://api.steinhq.com/v1/storages/5e732accb88d3d04ae0815ae/StateWiseHealthCapacity";