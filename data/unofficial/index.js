require('dotenv').config({ path: `${__dirname}/.env` });
const { google } = require('googleapis');
const fetch = require("node-fetch");

const COVID19_DATASHEET_ID_ALL = process.env['COVID19_SHEET_IDS'].split(/[^a-zA-Z0-9-_.]+/);
const COVID19_DATASHEET_ID_LATEST = COVID19_DATASHEET_ID_ALL[COVID19_DATASHEET_ID_ALL.length-1];

/**
 * Fetches data curated by covid19india.org
 * Original: https://docs.google.com/spreadsheets/d/1nzXUdaIWC84QipdVGUKTiCSc5xntBbpMpzLm6Si33zk/edit
 * Shadow: https://docs.google.com/spreadsheets/d/1DqODDqNYxqEc2JhzTYuuWc7zMD2GEKR0Xz94D1gW0ek/edit
 */
async function updateDataFromCovid19IndiaOrg() {
    const valueMapper = (hdr, value) => {
        if (value === undefined) return undefined;

        hdr = hdr.toLowerCase();
        if (hdr.startsWith("patient")) return ["patientId", parseInt(value)];
        else if (hdr.startsWith("date")) return ["reportedOn", value];
        else if (hdr.startsWith("estimated")) return ["onsetEstimate", value];
        else if (hdr.includes("age")) return ["ageEstimate", value];
        else if (hdr.startsWith("gender")) return ["gender", value.toLowerCase()[0]==='m' ? 'male' : value.toLowerCase()[0] === 'f' ? 'female' : ''];
        else if (hdr.startsWith("detected city")) return ["city", value];
        else if (hdr.startsWith("detected district")) return ["district", value];
        else if (hdr.startsWith("detected state")) return ["state", value];
        else if (hdr.includes("current status")) return ["status", value];
        else if (hdr.startsWith("contracted from")) return ["contractedFrom", value];
        else if (hdr.startsWith("notes")) return ["notes", value];
        else if (hdr.startsWith("source")) return ["sources", [value]];
    };
    let data = [];
    for (let i=0; i<COVID19_DATASHEET_ID_ALL.length; i++) {
        const sheetId = COVID19_DATASHEET_ID_ALL[i];
        const cellRange = "Raw_Data!A:O";
        let thisSheetData = await getGoogleSheetData(sheetId, cellRange, valueMapper);
        let lastValidIndex = thisSheetData.length;
        while (lastValidIndex-- > 0) {
            const record = thisSheetData[lastValidIndex];
            if (Object.keys(record).length > 1 && record["patientId"] && record["reportedOn"]) break;
        }
        thisSheetData = thisSheetData.slice(0, lastValidIndex+1);

        // merge this new sheet data on to the previous one, with the new one taking precedence
        for (let j=0; j<thisSheetData.length; j++) {
            const thisPatientId = thisSheetData[j]["patientId"];
            if (thisPatientId) {
                const existingPatientFromPrevSheetIdx = data.findIndex(x => x["patientId"] === thisPatientId);
                if (existingPatientFromPrevSheetIdx >= 0) {
                    data[existingPatientFromPrevSheetIdx] = thisSheetData[j];
                } else {
                    data.push(thisSheetData[j]);
                }
            }
        }
    }

    // update with NLP data using batches so as to not overload the NLP system
    const batchSize = 500;
    let datacopy = [];
    for (let i=0; i<data.length; i+=batchSize) {
        const batch = data.slice(i, Math.min(data.length, i+batchSize));
        await updateWithNlpData(batch);
        datacopy = datacopy.concat(batch);
    }

    updateUnofficialSource("covid19india.org", { summary: { total: data.length }, rawPatientData: datacopy });
}

/**
 * Update raw patient data using NLP from the API at http://coronatravelhistory.pythonanywhere.com/
 * Github repo: https://github.com/NirantK/coronaindia
 */
async function updateWithNlpData(rawPatientData) {
    const patientIdAndNotes = rawPatientData.map(x => ({patientId: `${x.patientId}`, notes: x.notes}));
    const nlpResponse = await fetch("http://coronatravelhistory.pythonanywhere.com/", {
        method: "POST",
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({patients: patientIdAndNotes})
    });
    if (nlpResponse.status === 200) {
        const nlpJson = await nlpResponse.json();
        const nlpPatients = nlpJson.patients;
        if (!nlpPatients || !Array.isArray(nlpPatients)) {
            console.log(nlpPatients);
        } else {
            for (let i=0; i<nlpPatients.length; i++) {
                if (!nlpPatients[i]) continue;
                const patientId = Object.keys(nlpPatients[i])[0];
                const patientNlpData = nlpPatients[i][patientId];
                const pidInt = parseInt(patientId);
                const idx = rawPatientData.findIndex(x => x.patientId === pidInt);
                if (idx >= 0) rawPatientData[idx] = {...rawPatientData[idx], ...patientNlpData};
            }
        }
    } else {
        throw "NLP service returned an error"
    }
}

/**
 * Fetches statewise summarised data from mastersheet of covid19india.org
 */
async function updateStatewiseDataFromCovid19IndiaOrg() {
    const valueMapper = (hdr, value) => {
        if (value === undefined) return undefined;

        hdr = hdr.toLowerCase().trim();
        if (hdr === "state") return ["state", value];
        else if (hdr === "confirmed") return ["confirmed", parseInt(value)];
        else if (hdr === "recovered") return ["recovered", parseInt(value)];
        else if (hdr === "deaths") return ["deaths", parseInt(value)];
        else if (hdr === "active") return ["active", parseInt(value)];
    };
    const sheetId = COVID19_DATASHEET_ID_LATEST;
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
async function updateUnofficialSource(sourceId, data, suffix=undefined, isRaw = undefined) {
    const current = new Date().toISOString();
    const finalData = isRaw ? data : {
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

/* Deprecated by upstream now */
async function updateTravelHistoryFromCovid19IndiaOrg() {
    const response = await fetch('https://api.covid19india.org/travel_history.json');
    if (response.status === 200) {
        const history = await response.json();
        updateUnofficialSource("covid19india.org", history, 'travelhistory');
    } else {
        throw `failed to fetch travel history ${response.status} ${response.statusText}`
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

async function bootstrapStatewiseHistory() {
    const locMap = {
        "an": "Andaman and Nicobar Islands",
        "ap": "Andhra Pradesh",
        "ar": "Arunachal Pradesh",
        "as": "Assam",
        "br": "Bihar",
        "ch": "Chandigarh",
        "ct": "Chhattisgarh",
        "dd": "Daman and Diu",
        "dl": "Delhi",
        "dn": "Dadra and Nagar Haveli",
        "ga": "Goa",
        "gj": "Gujarat",
        "hp": "Himachal Pradesh",
        "hr": "Haryana",
        "jh": "Jharkhand",
        "jk": "Jammu and Kashmir",
        "ka": "Karnataka",
        "kl": "Kerala",
        "la": "Lakshadweep",
        "ld": "Ladakh",
        "mh": "Maharashtra",
        "ml": "Meghalaya",
        "mn": "Manipur",
        "mp": "Madhya Pradesh",
        "mz": "Mizoram",
        "nl": "Nagaland",
        "or": "Odisha",
        "pb": "Punjab",
        "py": "Puducherry",
        "rj": "Rajasthan",
        "sk": "Sikkim",
        "tg": "Telangana",
        "tn": "Tamil Nadu",
        "tr": "Tripura",
        "up": "Uttar Pradesh",
        "ut": "Uttarakhand",
        "wb": "West Bengal"
    };
    const monthMap = {"Mar": "03", "Apr": "04", "May": "05"};
    const statusMap = {"Confirmed": "confirmed", "Deceased": "deaths", "Recovered": "recovered"};

    const dailyStatewise = [];
    const arr = (await (await fetch('https://api.covid19india.org/states_daily.json')).json())["states_daily"];
    arr.forEach(x => {
        let confirmed = 0, recovered = 0, deaths = 0, active = 0;
        let darr = x.date.split('-');
        let day = "2020-" + monthMap[darr[1]] + "-" + darr[0];

        let dayRecord = dailyStatewise.find(d => d.day === day);
        if (!dayRecord) {
            dayRecord = {
                day,
                total: { confirmed, recovered, deaths, active },
                statewise: []
            };
            dailyStatewise.push(dayRecord);
        }
        let prevRecord = dailyStatewise.length < 2 ? undefined : dailyStatewise[dailyStatewise.length-2];

        const status = statusMap[x.status];
        dayRecord.total[status] = parseInt(x["tt"]);
        if (prevRecord) {
            dayRecord.total[status] += prevRecord.total[status];
        }
        Object.keys(x).filter(st => st !== "tt" && st !== "status" && st !== "date").forEach(loc => {
            const stateName = locMap[loc];
            if (!stateName) {
                console.log(`Missing state for ${loc}`);
            }
            let locRecord = dayRecord.statewise.find(l => l.state === stateName);
            if (!locRecord) {
                locRecord = {state: stateName, confirmed: 0, recovered: 0, deaths: 0, active: 0};
                dayRecord.statewise.push(locRecord);
            }
            locRecord[status] = parseInt(x[loc]) || 0;
            if (prevRecord) {
                locRecord[status] += (prevRecord.statewise.find(l => l.state === stateName) || {status: 0})[status];
            }
        });
    });

    const fixActive = (x) => x.active = x.confirmed - (x.deaths + x.recovered);

    dailyStatewise.forEach(x => {
        fixActive(x.total);
        x.statewise.forEach(s => fixActive(s));
    });

    const history = {
        success: true,
        data: {
            source: "covid19india.org",
            lastRefreshed: new Date().toISOString(),
            history: dailyStatewise //.sort(x => x.day)
        }
    };

    updateUnofficialSource("covid19india.org", history, 'statewise_history', true);
}

// bootstrapStatewiseHistory();
updateStatewiseDataFromCovid19IndiaOrg();
updateDataFromCovid19IndiaOrg();
// updateTravelHistoryFromCovid19IndiaOrg();
