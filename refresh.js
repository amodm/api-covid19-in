import { errorResponse, rawResponse } from './api';
import { Store } from './store';
import { STORE_KEYS } from './constants';
import { refreshHospitalBeds } from "./refresh-hospital-beds";

/**
 * Refreshes all official data sources
 */
export async function refreshAllOfficialSources(request) {
    const isDebugMode = request.url.includes("debug");
    const onlyCaseCounts = request.url.includes("only=cases");
    const onlyHospitals = request.url.includes("only=hospitals");

    if (onlyCaseCounts) return await refreshCaseCounts(request, isDebugMode);
    else if (onlyHospitals) return await refreshHospitalBeds(request, isDebugMode);
    else {
        await refreshCaseCounts(request, isDebugMode);
        await refreshHospitalBeds(request, isDebugMode);
        return rawResponse({});
    }
}

/**
 * Fetches data from @SOURCE_URL and caches it
 */
async function refreshCaseCounts(request, isDebugMode) {
    const response = await fetch(SOURCE_URL);
    const apiJsonData = await (await fetch('https://www.mohfw.gov.in/data/datanew.json')).json();
    const content = (await response.text());
    if (response.status === 200) {
        const curOriginUpdateMillis = getOriginUpdateTime(content);
        const curOriginUpdateDate = new Date(curOriginUpdateMillis);
        const curRefreshedDate = new Date();
        const caseCounts = getCaseCounts(apiJsonData).filter(x => x['loc']);

        // heuristically check for failure
        if (!caseCounts || caseCounts.length === 0 || Object.keys(caseCounts[0]).length < 3) {
            return await errorResponse({code: 500, status: "Failed to parse HTML"})
        }

        // extract data from html content
        const notifications = getNotifications(content);
        const currentCaseCountRecord = createCaseCountRecord(caseCounts, await getUnofficialSummaries());
        const numForeign = getTotalConfirmedForeignCases(content);
        // fix the total number of foreign cases
        if (numForeign && numForeign > currentCaseCountRecord.summary.confirmedCasesForeign) {
            const f = currentCaseCountRecord.summary.confirmedCasesForeign;
            currentCaseCountRecord.summary.confirmedCasesForeign = numForeign;
            currentCaseCountRecord.summary.confirmedCasesIndian -= (numForeign-f);
        }

        // if we detect a new origin update, also update the historical timestamped record
        const historicalTimestamps = await getCaseCountHistoricalTimestamps();
        const isNewOriginUpdate = historicalTimestamps.length===0 ||
            curOriginUpdateMillis > new Date(historicalTimestamps[historicalTimestamps.length-1]).getTime();
        if (!isDebugMode) {
            const ts = curOriginUpdateDate.toISOString();
            await Store.put(getCaseCountKeyForHistoricalTimestamp(ts), JSON.stringify(caseCounts));
        }

        // update all the usual cached keys if not in debug mode
        const currentUpdatePromise = Promise.all(isDebugMode ? [] : [
            // update case counts
            Store.put(STORE_KEYS.CACHED_CASE_COUNTS, JSON.stringify({
                success: true,
                data: currentCaseCountRecord,
                lastRefreshed: curRefreshedDate.toISOString(),
                lastOriginUpdate: curOriginUpdateDate.toISOString()
            })),
            // update notifications
            Store.put(STORE_KEYS.CACHED_NOTIFICATIONS, JSON.stringify({
                success: true,
                data: {notifications: notifications},
                lastRefreshed: curRefreshedDate.toISOString(),
                lastOriginUpdate: curOriginUpdateDate.toISOString()
            })),
            // update case count history
            Store.put(STORE_KEYS.CACHED_CASE_COUNTS_HISTORY, JSON.stringify({
                success: true,
                data: await getCaseCountTimeSeries(historicalTimestamps),
                lastRefreshed: curRefreshedDate.toISOString(),
                lastOriginUpdate: curOriginUpdateDate.toISOString()
            }))
        ]);

        await currentUpdatePromise;
        return rawResponse(isDebugMode ? currentCaseCountRecord : {  });
    }
    else {
        const error = {code: response.status, status: response.statusText, body: content};
        return await errorResponse(error);
    }
}

/**
 * Get case count numbers from @content. The result is an array of objects, each specifying loc (location),
 * confirmedCasesIndian, confirmedCasesForeign, discharged and deaths
 */
function getCaseCounts(apiJsonData) {
    let caseCounts = [];
    let locNameIdx = -1;
    let confirmedIndianIdx = -1;
    let confirmedForeignIdx = -1;
    let dischargedIdx = -1;
    let deadIdx = -1;
    let totalIndian = 0;
    let totalForeign = 0;
    let serialNos = [];
    caseCounts = apiJsonData.map(x => ({
        loc: x["state_name"],
        confirmedCasesIndian: parseInt(x["new_active"]) + parseInt(x["new_cured"]) + parseInt(x["new_death"]),
        confirmedCasesForeign: 0,
        discharged: parseInt(x["new_cured"]),
        deaths: parseInt(x["new_death"])
    }));
    const totalIncludingUnidentified = 0; //getTotalIncludingUnconfirmedLocation(content);
    const calculatedTotal = totalIndian + totalForeign;
    if (totalIncludingUnidentified > 0 && totalIncludingUnidentified > calculatedTotal && totalIncludingUnidentified < calculatedTotal*3) {
        caseCounts.push({loc: LOC_UNIDENTIFIED, confirmedCasesIndian: totalIncludingUnidentified - calculatedTotal});
    }

    // deal with shitty updates from MoHFW by capturing the last proper update of confirmedCasesForeign
    //
    // we now get only confirmedCases from MoHFW, without any breakdown of indian vs foreign cases, so we use the last
    // snapshot of breakdown to calculate the best estimate of foreign cases, while still keeping the total correct
    const lastForeignUpdate = [{"loc":"Andhra Pradesh","confirmedCasesIndian":14,"confirmedCasesForeign":0,"discharged":1,"deaths":0},{"loc":"Andaman and Nicobar Islands","confirmedCasesIndian":9,"confirmedCasesForeign":0,"discharged":0,"deaths":0},{"loc":"Bihar","confirmedCasesIndian":9,"confirmedCasesForeign":0,"discharged":0,"deaths":1},{"loc":"Chandigarh","confirmedCasesIndian":8,"confirmedCasesForeign":0,"discharged":0,"deaths":0},{"loc":"Chhattisgarh","confirmedCasesIndian":6,"confirmedCasesForeign":0,"discharged":0,"deaths":0},{"loc":"Delhi","confirmedCasesIndian":38,"confirmedCasesForeign":1,"discharged":6,"deaths":2},{"loc":"Goa","confirmedCasesIndian":2,"confirmedCasesForeign":1,"discharged":0,"deaths":0},{"loc":"Gujarat","confirmedCasesIndian":52,"confirmedCasesForeign":1,"discharged":0,"deaths":4},{"loc":"Haryana","confirmedCasesIndian":19,"confirmedCasesForeign":14,"discharged":12,"deaths":0},{"loc":"Himachal Pradesh","confirmedCasesIndian":3,"confirmedCasesForeign":0,"discharged":0,"deaths":1},{"loc":"Jammu and Kashmir","confirmedCasesIndian":31,"confirmedCasesForeign":0,"discharged":1,"deaths":1},{"loc":"Karnataka","confirmedCasesIndian":76,"confirmedCasesForeign":0,"discharged":5,"deaths":3},{"loc":"Kerala","confirmedCasesIndian":174,"confirmedCasesForeign":8,"discharged":15,"deaths":1},{"loc":"Ladakh","confirmedCasesIndian":13,"confirmedCasesForeign":0,"discharged":3,"deaths":0},{"loc":"Madhya Pradesh","confirmedCasesIndian":30,"confirmedCasesForeign":0,"discharged":0,"deaths":2},{"loc":"Maharashtra","confirmedCasesIndian":183,"confirmedCasesForeign":3,"discharged":25,"deaths":6},{"loc":"Manipur","confirmedCasesIndian":1,"confirmedCasesForeign":0,"discharged":0,"deaths":0},{"loc":"Mizoram","confirmedCasesIndian":1,"confirmedCasesForeign":0,"discharged":0,"deaths":0},{"loc":"Odisha","confirmedCasesIndian":3,"confirmedCasesForeign":0,"discharged":0,"deaths":0},{"loc":"Puducherry","confirmedCasesIndian":1,"confirmedCasesForeign":0,"discharged":0,"deaths":0},{"loc":"Punjab","confirmedCasesIndian":38,"confirmedCasesForeign":0,"discharged":1,"deaths":1},{"loc":"Rajasthan","confirmedCasesIndian":52,"confirmedCasesForeign":2,"discharged":3,"deaths":0},{"loc":"Tamil Nadu","confirmedCasesIndian":36,"confirmedCasesForeign":6,"discharged":2,"deaths":1},{"loc":"Telengana","confirmedCasesIndian":56,"confirmedCasesForeign":10,"discharged":1,"deaths":1},{"loc":"Uttarakhand","confirmedCasesIndian":5,"confirmedCasesForeign":1,"discharged":1,"deaths":0},{"loc":"Uttar Pradesh","confirmedCasesIndian":54,"confirmedCasesForeign":1,"discharged":11,"deaths":0},{"loc":"West Bengal","confirmedCasesIndian":17,"confirmedCasesForeign":0,"discharged":0,"deaths":1}];
    caseCounts.forEach(x => {
        const lastF = lastForeignUpdate.find(e => e.loc === x.loc);
        if (lastF) {
            x.confirmedCasesForeign = lastF.confirmedCasesForeign;
            x.confirmedCasesIndian -= lastF.confirmedCasesForeign;
        } else {
            x.confirmedCasesForeign = 0;
        }
    });
    return caseCounts;
}

/**
 * Get case count numbers from @content. The result is an array of objects, each specifying loc (location),
 * confirmedCasesIndian, confirmedCasesForeign, discharged and deaths
 */
function getCaseCountsOld(content) {
    const caseCounts = [];
    let locNameIdx = -1;
    let confirmedIndianIdx = -1;
    let confirmedForeignIdx = -1;
    let dischargedIdx = -1;
    let deadIdx = -1;
    let totalIndian = 0;
    let totalForeign = 0;
    let serialNos = [];
    forEveryTableRowCol(content, (row, col, data) => {
        const headerRowInitialized = locNameIdx>=0 && confirmedIndianIdx>=0 /*&& confirmedForeignIdx>=0*/
            && dischargedIdx>=0 && deadIdx>=0;
        if (!headerRowInitialized) { // treat as header row
            const hdr = data.toLowerCase();
            if (hdr.includes("name")) locNameIdx = col;
            else if (hdr.includes("confirmed") /*&& hdr.includes("indian")*/) confirmedIndianIdx = col;
            //else if (hdr.includes("confirmed") && hdr.includes("foreign")) confirmedForeignIdx = col;
            else if (hdr.includes("discharged")) dischargedIdx = col;
            else if (hdr.includes("death")) deadIdx = col;
        }
        else if (headerRowInitialized) {
            if (col === 0) serialNos[row] = data;
            const validRow = serialNos[row].match(/\s*\d+\s*/g);

            if (validRow) {
                if (col === 0) caseCounts.push({
                    confirmedCasesIndian: 0,
                    confirmedCasesForeign: 0,
                    discharged: 0,
                    deaths: 0
                }); // initialize a new entry if it's a fresh row
                const locData = caseCounts[caseCounts.length-1]; // use the last entry

                if (col === locNameIdx) locData["loc"] = data;
                else if (col === confirmedIndianIdx) {
                    const v = parseInt(data.trim());
                    totalIndian += v;
                    locData["confirmedCasesIndian"] = v;
                }
                else if (col === confirmedForeignIdx) {
                    const v = parseInt(data.trim());
                    totalForeign += v;
                    locData["confirmedCasesForeign"] = v;
                }
                else if (col === dischargedIdx) locData["discharged"] = parseInt(data.trim());
                else if (col === deadIdx) locData["deaths"] = parseInt(data.trim());
            }
        }
    });
    const totalIncludingUnidentified = getTotalIncludingUnconfirmedLocation(content);
    const calculatedTotal = totalIndian + totalForeign;
    if (totalIncludingUnidentified > 0 && totalIncludingUnidentified > calculatedTotal && totalIncludingUnidentified < calculatedTotal*3) {
        caseCounts.push({loc: LOC_UNIDENTIFIED, confirmedCasesIndian: totalIncludingUnidentified - calculatedTotal});
    }

    // deal with shitty updates from MoHFW by capturing the last proper update of confirmedCasesForeign
    //
    // we now get only confirmedCases from MoHFW, without any breakdown of indian vs foreign cases, so we use the last
    // snapshot of breakdown to calculate the best estimate of foreign cases, while still keeping the total correct
    const lastForeignUpdate = [{"loc":"Andhra Pradesh","confirmedCasesIndian":14,"confirmedCasesForeign":0,"discharged":1,"deaths":0},{"loc":"Andaman and Nicobar Islands","confirmedCasesIndian":9,"confirmedCasesForeign":0,"discharged":0,"deaths":0},{"loc":"Bihar","confirmedCasesIndian":9,"confirmedCasesForeign":0,"discharged":0,"deaths":1},{"loc":"Chandigarh","confirmedCasesIndian":8,"confirmedCasesForeign":0,"discharged":0,"deaths":0},{"loc":"Chhattisgarh","confirmedCasesIndian":6,"confirmedCasesForeign":0,"discharged":0,"deaths":0},{"loc":"Delhi","confirmedCasesIndian":38,"confirmedCasesForeign":1,"discharged":6,"deaths":2},{"loc":"Goa","confirmedCasesIndian":2,"confirmedCasesForeign":1,"discharged":0,"deaths":0},{"loc":"Gujarat","confirmedCasesIndian":52,"confirmedCasesForeign":1,"discharged":0,"deaths":4},{"loc":"Haryana","confirmedCasesIndian":19,"confirmedCasesForeign":14,"discharged":12,"deaths":0},{"loc":"Himachal Pradesh","confirmedCasesIndian":3,"confirmedCasesForeign":0,"discharged":0,"deaths":1},{"loc":"Jammu and Kashmir","confirmedCasesIndian":31,"confirmedCasesForeign":0,"discharged":1,"deaths":1},{"loc":"Karnataka","confirmedCasesIndian":76,"confirmedCasesForeign":0,"discharged":5,"deaths":3},{"loc":"Kerala","confirmedCasesIndian":174,"confirmedCasesForeign":8,"discharged":15,"deaths":1},{"loc":"Ladakh","confirmedCasesIndian":13,"confirmedCasesForeign":0,"discharged":3,"deaths":0},{"loc":"Madhya Pradesh","confirmedCasesIndian":30,"confirmedCasesForeign":0,"discharged":0,"deaths":2},{"loc":"Maharashtra","confirmedCasesIndian":183,"confirmedCasesForeign":3,"discharged":25,"deaths":6},{"loc":"Manipur","confirmedCasesIndian":1,"confirmedCasesForeign":0,"discharged":0,"deaths":0},{"loc":"Mizoram","confirmedCasesIndian":1,"confirmedCasesForeign":0,"discharged":0,"deaths":0},{"loc":"Odisha","confirmedCasesIndian":3,"confirmedCasesForeign":0,"discharged":0,"deaths":0},{"loc":"Puducherry","confirmedCasesIndian":1,"confirmedCasesForeign":0,"discharged":0,"deaths":0},{"loc":"Punjab","confirmedCasesIndian":38,"confirmedCasesForeign":0,"discharged":1,"deaths":1},{"loc":"Rajasthan","confirmedCasesIndian":52,"confirmedCasesForeign":2,"discharged":3,"deaths":0},{"loc":"Tamil Nadu","confirmedCasesIndian":36,"confirmedCasesForeign":6,"discharged":2,"deaths":1},{"loc":"Telengana","confirmedCasesIndian":56,"confirmedCasesForeign":10,"discharged":1,"deaths":1},{"loc":"Uttarakhand","confirmedCasesIndian":5,"confirmedCasesForeign":1,"discharged":1,"deaths":0},{"loc":"Uttar Pradesh","confirmedCasesIndian":54,"confirmedCasesForeign":1,"discharged":11,"deaths":0},{"loc":"West Bengal","confirmedCasesIndian":17,"confirmedCasesForeign":0,"discharged":0,"deaths":1}];
    caseCounts.forEach(x => {
        const lastF = lastForeignUpdate.find(e => e.loc === x.loc);
        if (lastF) {
            x.confirmedCasesForeign = lastF.confirmedCasesForeign;
            x.confirmedCasesIndian -= lastF.confirmedCasesForeign;
        } else {
            x.confirmedCasesForeign = 0;
        }
    });
    return caseCounts;
}

/**
 * Iterates over all table rows in @content and invokes @cb with params as (row, col, cellData)
 */
function forEveryTableRowCol(content, cb) {
    let htmlContent = content.replace(/<!--.*?-->/gs, "");
    const rowRegex = RegExp("<tr[^>]*>.+?</tr", "gs");
    let rowMatch;
    let rowCount = 0;
    while ((rowMatch = rowRegex.exec(htmlContent))) {
        let colCount = 0;
        const colRegex = RegExp("<t[dh][^>]*>(.+?)</t[dh]>", "gs");
        let colMatch;
        while ((colMatch = colRegex.exec(rowMatch[0]))) {
            const cellData = colMatch[0].replace(/<[^>]+>/gs, '');
            cb(rowCount, colCount, cellData);
            colCount++;
        }
        rowCount++;
    }
}

/**
 * Creates a record that includes summary stats, along with the regional data
 */
function createCaseCountRecord(regionalCaseCounts, unofficialSummaries) {
    const summaryCounts = {
        "total": 0,
        "confirmedCasesIndian": 0,
        "confirmedCasesForeign": 0,
        "discharged": 0,
        "deaths": 0,
        "confirmedButLocationUnidentified": 0
    };

    let unidentified = 0;
    const displayedRegionalCaseCounts = [];
    for (let i=0; i<regionalCaseCounts.length; i++) {
        if (regionalCaseCounts[i]["loc"] === LOC_UNIDENTIFIED ) {
            unidentified = parseInt(regionalCaseCounts[i]["confirmedCasesIndian"]);
        } else {
            summaryCounts["confirmedCasesIndian"] += regionalCaseCounts[i]["confirmedCasesIndian"];
            summaryCounts["confirmedCasesForeign"] += regionalCaseCounts[i]["confirmedCasesForeign"];
            regionalCaseCounts[i]["totalConfirmed"] = regionalCaseCounts[i]["confirmedCasesIndian"] + regionalCaseCounts[i]["confirmedCasesForeign"];
            summaryCounts["discharged"] += regionalCaseCounts[i]["discharged"];
            summaryCounts["deaths"] += regionalCaseCounts[i]["deaths"];
            displayedRegionalCaseCounts.push(regionalCaseCounts[i]);
        }
    }
    summaryCounts["total"] = summaryCounts["confirmedCasesIndian"] + summaryCounts["confirmedCasesForeign"];
    if (unidentified > 0 ) {
        summaryCounts["confirmedButLocationUnidentified"] = unidentified;
        summaryCounts["total"] = summaryCounts["total"] + unidentified;
    }

    return { "summary": summaryCounts, "unofficial-summary": unofficialSummaries, "regional": displayedRegionalCaseCounts };
}

/**
 * Parse the MoHFW site content for total number of confirmed foreign cases
 */
function getTotalConfirmedForeignCases(content) {
    const r = RegExp(" (\\d+) foreign Nationals", "gi");
    let m;
    if ((m = r.exec(content))) {
        return parseInt(m[1]);
    } else {
        return 48;
    }
}

/**
 * Get the origin update information as mentioned in @content
 * @returns {number} milliseconds since epoch
 */
function getOriginUpdateTime(content) {
    const r = RegExp("as on (\\d{2})\.(\\d{2})\.(\\d{4}) at (\\d{2}):(\\d{2})\\s*([AP]M)", "gi");
    let m;
    if ((m = r.exec(content))) {
        const day = parseInt(m[1]);
        const month = parseInt(m[2]) - 1;
        const year = parseInt(m[3]);
        const hour = parseInt(m[4]);
        const minute = parseInt(m[5]);
        const isPM = m[6].toLowerCase() === "pm";

        // use UTC to be consistent irrespective of TZ in which this is being executed
        let time = Date.UTC(year, month, day, hour, minute, 0, 0);
        time = time - 330 * 60 * 1000; // roll it back by 5:30hrs to capture it as IST
        if (isPM) time = time + 12 * 3600 * 1000; // add 12 hrs if it's PM

        return time;
    } else if ((m = RegExp("as on[ :]+(\\d{2})\\s+([a-zA-Z]+)\\s+(\\d{4})[, ]+(\\d{2}):(\\d{2})", "gi").exec(content))) {
        const day = parseInt(m[1]);
        const month3 = m[2].substr(0, 3);
        const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].findIndex(x => x === month3);
        const year = parseInt(m[3]);
        const hour = parseInt(m[4]);
        const minute = parseInt(m[5]);
        // use UTC to be consistent irrespective of TZ in which this is being executed
        let time = Date.UTC(year, month, day, hour, minute, 0, 0);
        return time - 330 * 60 * 1000; // roll it back by 5:30hrs to capture it as IST
    } else {
        return 0;
    }
}

/**
 * Get the total count including unconfirmed location, as called out explicitly
 */
function getTotalIncludingUnconfirmedLocation(content) {
    const from = content.search(/>Total[#*]*</);
    if (from > 0) {
        const to = content.indexOf('</tr', from);
        if (to > 0) {
            const r = RegExp(">\\s*(\\d+)\\s*[*#]?\\s*<", "gs");
            let m;
            let largest = 0;
            while ((m = r.exec(content.substring(from, to)))) {
                let v = parseInt(m[1]);
                if (v > largest) largest = v;
            }
            return largest;
        }
    }
    return 0;
}

/**
 * Parse notifications from html content
 */
function getNotifications(content) {
    const notifications = [];
    const listRegex = RegExp("<li>(.+?)</li>", "g");
    const hrefRegex = RegExp("<a .*href\\s*=\\s*\"([^\"]+).+");
    const tagRegex = RegExp("<[^>]+>", "g");
    let listMatch;
    while ((listMatch = listRegex.exec(content))) {
        const innerHTML = listMatch[1];
        const txt = innerHTML.replace(tagRegex, ' ').replace(/\s+/g, ' ').trim();
        let href;
        if ((href = innerHTML.match(hrefRegex))) {
            href = href[1];
            if (href.endsWith(".pdf") || href.includes(".gov.in")) {
                if (href.startsWith('/')) href = `${SOURCE_URL}${href}`;
                notifications.push({ title: txt, link: href });
            }
        }
    }
    return notifications;
}

/**
 * Get the sorted (oldest to latest) list of timestamps associated with historical case count records
 */
async function getCaseCountHistoricalTimestamps() {
    let cursor = undefined;
    const keys = [];
    while (true) {
        const keysResponse = await Store.list(getPrefixForHistoricalCaseCountKeys(), cursor);
        for (let i=0; i<keysResponse.keys.length; i++) {
            keys.push(getTimestampFromHistoricalCaseCountKey(keysResponse.keys[i].name));
        }
        if (keysResponse["list_complete"]) break;
        else cursor = keysResponse.cursor;
    }
    return keys.sort()
}

/**
 * Get an array of historical records - each entry representing the last record for that day
 */
async function getCaseCountTimeSeries(timestamps) {
    const day2Timestamp = {};

    // pick the last timestamp from each day
    for (let i=0; i<timestamps.length; i++) {
        const ts = timestamps[i];
        const day = getDayFromTimestamp(ts);
        const existingTimestamp = day2Timestamp[day];
        if (!existingTimestamp || existingTimestamp.localeCompare(ts) < 0) day2Timestamp[day] = ts;
    }

    const history = await fetch('https://api.rootnet.in/covid19-in/stats/history').then(x => x.json());
    const existingRecords = history.data.slice(0, history.data.length-2); // make sure we're refreshing the last 2 days
    const recordTimestamps = Object.values(day2Timestamp);
    for (let rts=0; rts<recordTimestamps.length; rts++) {
        let found = false;
        const day = recordTimestamps[rts].substring(0, 10);
        for (let i=0; i<existingRecords.length; i++) {
            if (existingRecords[i].day == day) {
                found = true;
                break;
            }
        }
        if (!found) {
            const recordForDay = createCaseCountRecord(await Store.get(getCaseCountKeyForHistoricalTimestamp(recordTimestamps[rts]), "json"));
            existingRecords.push({day: getDayFromTimestamp(recordTimestamps[rts]), ...recordForDay});
        }
    }
    return existingRecords.sort((x,y) => x.day.localeCompare(y.day));
    /*const records = await Promise.all(
        recordTimestamps.map(getCaseCountKeyForHistoricalTimestamp).map(k => Store.get(k, "json"))
    );

    const timeseries = [];
    for (let i=0; i<recordTimestamps.length; i++) {
        console.log(`starting for ${recordTimestamps[i]}`);
        const recordForDay = createCaseCountRecord(records[i]);
        timeseries.push({day: getDayFromTimestamp(recordTimestamps[i]), ...recordForDay});
        console.log(`done for ${recordTimestamps[i]}`);
    }
    return timeseries.sort((x,y) => x.day.localeCompare(y.day));*/
}

async function getUnofficialSummaries() {
    try {
        const covid19Key = STORE_KEYS.CACHED_UNOFFICIAL_SRC_PREFIX + "covid19india.org_statewise";
        const cv19Summary = (await Store.get(covid19Key, "json"))["data"]["total"];
        return [{
            source: "covid19india.org",
            total: cv19Summary["confirmed"],
            recovered: cv19Summary["recovered"],
            deaths: cv19Summary["deaths"],
            active: cv19Summary["active"],
        }];
    } catch (e) {
        // console.log(e);
        return undefined;
    }
}

/**
 * Parses an ISO8601 date format to get YYYY-MM-DD part
 */
function getDayFromTimestamp(timestamp) {
    return timestamp.substr(0, 10);
}

/* Helper functions for historical record related key management */
function getCaseCountKeyForHistoricalTimestamp(timestamp) {
    return STORE_KEYS.CASE_COUNTS + "/" + timestamp;
}
function getTimestampFromHistoricalCaseCountKey(key) {
    return key.split('/')[1];
}
function getPrefixForHistoricalCaseCountKeys() {
    return STORE_KEYS.CASE_COUNTS + "/"
}

const SOURCE_URL = 'https://www.mohfw.gov.in';
const LOC_UNIDENTIFIED = "unknown";
