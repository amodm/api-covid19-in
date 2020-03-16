import { errorResponse, fetchTimestamps, successResponse } from './api';
import { Store } from './store';
import { STORE_KEYS } from './constants';

/**
 * Fetches data from @SOURCE_URL and caches it
 */
export async function refreshFromSource() {
    const olderTimestamps = fetchTimestamps();
    const response = await fetch(SOURCE_URL);
    const content = (await response.text());
    if (response.status === 200) {
        const curOriginUpdate = getOriginUpdate(content);
        const curRefreshed = new Date().getTime();
        const fetchTimestampsPromise = Promise.all([
            Promise.resolve(curRefreshed),
            Promise.resolve(curOriginUpdate)
        ]);
        const caseCounts = getCaseCounts(content);
        const notifications = getNotifications(content);
        const currentUpdatePromise = Promise.all([
            Store.put(STORE_KEYS.LAST_UPDATED_ORIGIN, curOriginUpdate.toString()),
            Store.put(STORE_KEYS.LAST_REFRESHED, curRefreshed.toString()),
            Store.put(STORE_KEYS.CASE_COUNTS, JSON.stringify(caseCounts)),
            Store.put(STORE_KEYS.NOTIFICATIONS, JSON.stringify(notifications))
        ]);

        // if we detect a new origin update, we should also update a time-series key to allow for time series analysis
        // later
        const prevOriginUpdate = parseInt((await olderTimestamps)[1]);
        if (curOriginUpdate > prevOriginUpdate) {
            const suffix = "/" + new Date(curOriginUpdate).toISOString();
            await Store.put(STORE_KEYS.CASE_COUNTS + suffix, JSON.stringify(caseCounts));
        }
        await currentUpdatePromise;
        return await successResponse({  }, fetchTimestampsPromise);
    }
    else {
        return await errorResponse({code: response.status, status: response.statusText, body: content})
    }
}

/**
 * Get case count numbers from @content. The result is an array of objects, each specifying loc (location),
 * confirmedCasesIndian, confirmedCasesForeign, discharged and deaths
 */
function getCaseCounts(content) {
    const caseCounts = [];
    let locNameIdx = -1;
    let confirmedIndianIdx = -1;
    let confirmedForeignIdx = -1;
    let dischargedIdx = -1;
    let deadIdx = -1;
    let isTotalRow = false;
    forEveryTableRowCol(content, (row, col, data) => {
        if (row === 0) { // treat as header row
            const hdr = data.toLowerCase();
            if (hdr.includes("name")) locNameIdx = col;
            else if (hdr.includes("confirmed") && hdr.includes("indian")) confirmedIndianIdx = col;
            else if (hdr.includes("confirmed") && hdr.includes("foreign")) confirmedForeignIdx = col;
            else if (hdr.includes("discharged")) dischargedIdx = col;
            else if (hdr.includes("death")) deadIdx = col;
        }
        else {
            if (!isTotalRow) isTotalRow = col === 0 && data.toLowerCase().trim().startsWith("total");

            if (!isTotalRow) {
                if (col === 0) caseCounts.push({}); // initialize a new entry if it's a fresh row
                const locData = caseCounts[caseCounts.length-1]; // use the last entry

                if (col === locNameIdx) locData["loc"] = data;
                else if (col === confirmedIndianIdx) locData["confirmedCasesIndian"] = parseInt(data.trim());
                else if (col === confirmedForeignIdx) locData["confirmedCasesForeign"] = parseInt(data.trim());
                else if (col === dischargedIdx) locData["discharged"] = parseInt(data.trim());
                else if (col === deadIdx) locData["deaths"] = parseInt(data.trim());
            }
        }
    });
    return caseCounts;
}

/**
 * Iterates over all table rows in @content and invokes @cb with params as (row, col, cellData)
 */
function forEveryTableRowCol(content, cb) {
    const rowRegex = RegExp("<tr>.+?</tr>", "gs");
    let rowMatch;
    let rowCount = 0;
    while ((rowMatch = rowRegex.exec(content))) {
        let colCount = 0;
        const colRegex = RegExp("<td[^>]*>(.+?)</td>", "gs");
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
 * Get the origin update information as mentioned in @content
 * @returns {number} milliseconds since epoch
 */
function getOriginUpdate(content) {
    const r = RegExp("as on (\\d{2})\.(\\d{2})\.(\\d{4}) at (\\d{2}):(\\d{2})\\s*([AP]M)", "gi");
    let m;
    if ((m = r.exec(content))) {
        const day = parseInt(m[1]);
        const month = parseInt(m[2])-1;
        const year = parseInt(m[3]);
        const hour = parseInt(m[4]);
        const minute = parseInt(m[5]);
        const isPM = m[6].toLowerCase() === "pm";

        // use UTC to be consistent irrespective of TZ in which this is being executed
        let time = Date.UTC(year, month, day, hour, minute, 0, 0);
        time = time - 330*60*1000; // roll it back by 5:30hrs to capture it as IST
        if (isPM) time = time + 12*3600*1000; // add 12 hrs if it's PM

        return time;
    } else {
        return 0;
    }
}

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

const SOURCE_URL = 'https://www.mohfw.gov.in';