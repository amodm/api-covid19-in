import { errorResponse, rawResponse } from './api';
import { Store } from './store';
import { STORE_KEYS } from './constants';

export async function refreshHospitalBeds(request, isDebugMode) {
    const response1 = await refreshBedCountsStatewise(request, isDebugMode);
    const response2 = await refreshMedicalColleges(request, isDebugMode);

    // TODO:amodm:figure out a better way to return a composite
    if (response1.status !== 200) return response1;
    if (response2.status !== 200) return response2;
    return response1;
}

/**
 * Fetches data from @SOURCE_URL_STATEWISE and caches it
 */
async function refreshBedCountsStatewise(request, isDebugMode) {
    const response = await fetch(SOURCE_URL_STATEWISE);
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
                sources.push({url: src, lastUpdated: recordUpdated});
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
            data: {summary, sources, regional: records},
            lastRefreshed,
            lastOriginUpdate
        };

        await Store.put(STORE_KEYS.CACHED_HOSPITAL_BEDS_COUNT, JSON.stringify(data));
        return rawResponse(isDebugMode ? data : {});
    }
    else {
        const error = {code: response.status, status: response.statusText, body: content};
        return await errorResponse(error);
    }
}

/**
 * Fetches data from @SOURCE_URL_MEDICAL_COLLEGES and caches it
 */
async function refreshMedicalColleges(request, isDebugMode) {
    const response = await fetch(SOURCE_URL_MEDICAL_COLLEGES);
    const content = (await response.json());
    if (response.status === 200) {
        if (!Array.isArray(content) || content.length === 0) {
            return await errorResponse({"error": "response not an array"});
        }

        const medicalColleges = content.map(x => ({
            state: x["State/UT"],
            name: x["MedicalCollegeName"],
            city: x["City/Town"],
            ownership: x["Govt/Private"],
            admissionCapacity: parseValidInt(x["AdmissionCapacity"]),
            hospitalBeds: parseValidInt(x["BedsInAttachedHospital"])
        }));

        const lastRefreshed = new Date().toISOString();
        const lastOriginUpdate = lastRefreshed;
        const data = {
            success: true,
            data: {
                medicalColleges,
                sources: ["http://www.indiaenvironmentportal.org.in/files/file/NHP%202018.pdf"]
            },
            lastRefreshed,
            lastOriginUpdate
        };

        await Store.put(STORE_KEYS.CACHED_MEDICAL_COLLEGES, JSON.stringify(data));
        return rawResponse(isDebugMode ? data : {});
    }
    else {
        const error = {code: response.status, status: response.statusText, body: content};
        return await errorResponse(error);
    }
}

function parseValidInt(s) {
    return (s && s.match(/^\d+$/g)) ? parseInt(s) : 0
}

function getLastUpdated(content) {
    const r = RegExp("(\\d{4}-\\d{2}-\\d{2}) (\\d{1,2}:\\d{2}:\\d{2})");
    const m = content.match(r);
    if (m.length !== 3) return "1970-01-01T00:00:00.000Z";

    const hhmmss = m[2].length===7 ? `0${m[2]}` : m[2];
    return `${m[1]}T${hhmmss}.000Z`;
}

const SOURCE_URL_STATEWISE = "https://api.steinhq.com/v1/storages/5e732accb88d3d04ae0815ae/StateWiseHealthCapacity";
const SOURCE_URL_MEDICAL_COLLEGES = "https://api.steinhq.com/v1/storages/5e6e3e9fb88d3d04ae08158c/Hospitals";