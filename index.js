import { refreshAllOfficialSources } from "./refresh";
import { getAllUnofficialSources } from "./unofficial";
import {errorResponse, rawResponse} from "./api";
import { Store } from "./store";
import { STORE_KEYS } from "./constants";
import {refreshTestingData} from "./refresh-icmr";

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
});

async function handleRequest(request) {
  const path = new URL(request.url).pathname.substr(ROUTE_PREFIX.length);
  const handler = getRouteHandler(path);
  return handler(request, path);
}

function getRouteHandler(path) {
  let handler = routeHandlers[path];
  if (!handler) {
    // get the handler with the longest matching prefix
    const routePrefixes = Object.keys(routeHandlers);
    let longestPrefix = "";
    for (let i=0; i<routePrefixes.length; i++) {
      if (path.startsWith(routePrefixes[i]) && longestPrefix.length < routePrefixes[i].length) {
        handler = routeHandlers[routePrefixes[i]];
        longestPrefix = routePrefixes[i];
      }
    }
  }
  return handler ? handler : notFoundHandler;
}

async function notFoundHandler() {
  return new Response('404 nothing to see here', { status: 404, statusText: 'Not Found' })
}

async function cachedData(key, decorator) {
  try {
    const data= await Store.get(key);
    return rawResponse(decorator ? decorator(data) : data);
  } catch (err) {
    return errorResponse({ "message": err })
  }
}

async function fromBlobStore(originUrl) {
  // Fetch from origin server.
  let response = await fetch(originUrl);

  // Create an identity TransformStream (a.k.a. a pipe).
  // The readable side will become our new response body.
  let { readable, writable } = new TransformStream();

  // Start pumping the body. NOTE: No await!
  response.body.pipeTo(writable);

  // ... and deliver our Response while that's running.
  return new Response(readable, response)
}

function fixLocationNameChanges(content) {
  return content.replace(/Pondicherry/g, "Puducherry").replace(/Union Territory of /g, "");
}

async function getCovid19PatientDb(request, path) {
  path = path.replace(/^.+patientdb\/?/g, '');
  if (path === '') return cachedData(STORE_KEYS.CACHED_UNOFFICIAL_SRC_PREFIX + "covid19india.org");
  else if (path === 'history') return fromBlobStore('https://covid19-data.rootnet.in/covid19india.org/patientdb-historical.json');
  else {
    let response = await fetch(`https://covid19-data.rootnet.in/covid19india.org/patientdb-${path}.json`);
    if (response.status === 200) {
      let data = await response.json();
      return rawResponse(JSON.stringify({
        success: true,
        lastRefreshed: data.lastRefreshed,
        data,
      }))
    } else {
      return errorResponse({ message: response.statusText }, undefined, response.status);
    }
  }
}

const ROUTE_PREFIX = "/covid19-in";

const routeHandlers = {
  '/contacts': () => cachedData(STORE_KEYS.CACHED_CONTACTS),
  '/stats': () => cachedData(STORE_KEYS.CACHED_CASE_COUNTS),
  '/stats/latest': () => cachedData(STORE_KEYS.CACHED_CASE_COUNTS, fixLocationNameChanges),
  '/stats/daily': () => cachedData(STORE_KEYS.CACHED_CASE_COUNTS_HISTORY, fixLocationNameChanges),
  '/stats/history': () => cachedData(STORE_KEYS.CACHED_CASE_COUNTS_HISTORY, fixLocationNameChanges),
  '/stats/hospitals': () => cachedData(STORE_KEYS.CACHED_HOSPITAL_BEDS_COUNT),
  '/stats/testing/latest': () => cachedData(STORE_KEYS.CACHED_TESTING_HISTORY, data => {
    const j = JSON.parse(data);
    return {
      success: j.success,
      data: j.data[j.data.length-1],
      lastRefreshed: j.lastRefreshed,
      lastOriginUpdate: j.lastOriginUpdate
    }
  }),
  '/stats/testing/history': () => cachedData(STORE_KEYS.CACHED_TESTING_HISTORY),
  '/stats/testing/raw': () => cachedData(STORE_KEYS.CACHED_TESTING_HISTORY_RAW),
  '/notifications': () => cachedData(STORE_KEYS.CACHED_NOTIFICATIONS),
  '/unofficial/sources': getAllUnofficialSources,
  '/unofficial/covid19india.org': () =>
      cachedData(STORE_KEYS.CACHED_UNOFFICIAL_SRC_PREFIX + "covid19india.org"),
  '/unofficial/covid19india.org/patientdb': getCovid19PatientDb,
  '/unofficial/covid19india.org/statewise': () =>
      cachedData(STORE_KEYS.CACHED_UNOFFICIAL_SRC_PREFIX + "covid19india.org_statewise"),
  '/unofficial/covid19india.org/statewise/history': () =>
      cachedData(STORE_KEYS.CACHED_UNOFFICIAL_SRC_PREFIX + "covid19india.org_statewise_history"),
  '/unofficial/covid19india.org/travelhistory': () =>
      cachedData(STORE_KEYS.CACHED_UNOFFICIAL_SRC_PREFIX + "covid19india.org_travelhistory"),
  '/refresh': refreshAllOfficialSources,
  '/refresh/testing': refreshTestingData
};
