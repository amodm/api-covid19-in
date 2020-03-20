require('dotenv').config({ path: `${__dirname}/.env` });
const { google } = require('googleapis');
const fetch = require("node-fetch");

/**
 * Fetches data curated by covid19india.org
 * https://docs.google.com/spreadsheets/d/1nzXUdaIWC84QipdVGUKTiCSc5xntBbpMpzLm6Si33zk/edit#gid=0
 */
async function updateDataFromCovid19IndiaOrg() {
    const valueMapper = (hdr, value) => {
        if (value === undefined) return undefined;

        hdr = hdr.toLowerCase();
        if (hdr.startsWith("patient")) return ["patientId", parseInt(value)];
        else if (hdr.startsWith("date")) return ["reportedOn", value];
        else if (hdr.startsWith("estimated")) return ["onsetEstimate", value];
        else if (hdr.includes("age")) return ["ageEstimate", value];
        else if (hdr.startsWith("gender")) return ["gender", value.toLowerCase()[0]==='m' ? 'male' : 'female'];
        else if (hdr.startsWith("detected city")) return ["city", value];
        else if (hdr.startsWith("detected district")) return ["district", value];
        else if (hdr.startsWith("detected state")) return ["state", value];
        else if (hdr.includes("current status")) return ["status", value];
        else if (hdr.startsWith("contracted from")) return ["contractedFrom", value];
        else if (hdr.startsWith("notes")) return ["notes", value];
        else if (hdr.startsWith("source")) return ["sources", [value]];
    };
    const sheetId = "1nzXUdaIWC84QipdVGUKTiCSc5xntBbpMpzLm6Si33zk";
    const cellRange = "Raw_Data!A:O";
    let data = await getGoogleSheetData(sheetId, cellRange, valueMapper);
    let lastValidIndex = data.length;
    while (lastValidIndex-- > 0) {
        const record = data[lastValidIndex];
        if (Object.keys(record).length > 1 && record["patientId"] && record["reportedOn"]) break;
    }
    data = data.slice(0, lastValidIndex+1);
    updateUnofficialSource("covid19india.org", { summary: { total: data.length }, rawPatientData: data });
}

/**
 * Fetches statewise summarised data from mastersheet of covid19india.org
 * https://docs.google.com/spreadsheets/d/1nzXUdaIWC84QipdVGUKTiCSc5xntBbpMpzLm6Si33zk/htmlview?sle=true#
 */
async function updateStatewiseDataFromCovid19IndiaOrg() {
    const valueMapper = (hdr, value) => {
        if (value === undefined) return undefined;

        hdr = hdr.toLowerCase();
        if (hdr.startsWith("state")) return ["state", value];
        else if (hdr.startsWith("confirmed")) return ["confirmed", parseInt(value)];
        else if (hdr.startsWith("recovered")) return ["recovered", parseInt(value)];
        else if (hdr.startsWith("deaths")) return ["deaths", parseInt(value)];
        else if (hdr.startsWith("active")) return ["active", parseInt(value)];
    };
    const sheetId = "1nzXUdaIWC84QipdVGUKTiCSc5xntBbpMpzLm6Si33zk";
    const cellRange = "Statewise!A:E";
    let data = await getGoogleSheetData(sheetId, cellRange, valueMapper);
    let lastValidIndex = data.length;
    while (lastValidIndex-- > 0) {
        const record = data[lastValidIndex];
        if (Object.keys(record).length > 1) break;
    }
    data = data.slice(0, lastValidIndex+1);
    const totalEntry = data[0];
    delete totalEntry["state"];
    data = data.slice(1, data.length);
    const statewiseResponse = { total: totalEntry, statewise: data };
    updateUnofficialSource("covid19india.org", statewiseResponse, 'statewise');
}

/**
 * Update the unofficial source record in Workers KV
 */
async function updateUnofficialSource(sourceId, data, suffix=undefined) {
    const current = new Date().toISOString();
    const finalData = {
        success: true,
        data: {source: sourceId, lastRefreshed: current, ...data},
        lastRefreshed: current,
        lastOriginUpdate: current
    };
    const accountId = process.env['CF_ACCOUNT_ID'];
    const namespaceId = process.env['CF_NAMESPACE_ID'];
    const key = suffix ? `cached_unofficial_src_${sourceId}_${suffix}` : `cached_unofficial_src_${sourceId}`;
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${key}`;
    await fetch(url, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env['CF_API_TOKEN']}`
        },
        body: JSON.stringify(finalData)
    });
}

async function getGoogleSheetData(spreadsheetId, range, valueMapper) {
    try {
        const sheets = google.sheets({version: 'v4', auth: get_authorized_google_client()});
        const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
        const rows = response.data.values;
        const result = [];
        if (rows.length) {
            const headers = rows[0];
            for (let i=1; i<rows.length; i++) {
                const record = {};
                for (let j=0; j<headers.length; j++) {
                    const cellData = valueMapper(headers[j], rows[i][j]);
                    if (!cellData || cellData[1] === undefined) continue;

                    if (Array.isArray(cellData[1])) {
                        const existingData = record[cellData[0]];
                        record[cellData[0]] = existingData ? existingData.concat(cellData[1]) : cellData[1];
                    } else {
                        record[cellData[0]] = cellData[1];
                    }
                }
                result.push(record);
            }
        } else {
            console.log('No data found.');
        }
        return result;
    } catch (err) {
        console.error(err);
        throw err;
    }
}

/**
 * Create an authorized Google OAuth2 client
 */
function get_authorized_google_client() {
    const credentials = JSON.parse(process.env['GOOGLE_CREDENTIALS']);
    const {client_secret, client_id, redirect_uris} = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    oAuth2Client.setCredentials(JSON.parse(process.env['GOOGLE_AUTH_TOKEN']));
    return oAuth2Client;
}

updateDataFromCovid19IndiaOrg();
updateStatewiseDataFromCovid19IndiaOrg();
