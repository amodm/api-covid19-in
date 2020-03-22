import { refreshAllOfficialSources } from "./refresh";
import { getAllUnofficialSources } from "./unofficial";
import {errorResponse, rawResponse} from "./api";
import { Store } from "./store";
import { STORE_KEYS } from "./constants";

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
});

async function handleRequest(request) {
  const path = new URL(request.url).pathname.substr(ROUTE_PREFIX.length);
  const handler = routeHandlers[path] || notFoundHandler;
  return handler(request, path)
}

async function notFoundHandler() {
  return new Response('404 nothing to see here', { status: 404, statusText: 'Not Found' })
}

async function cachedData(key, applyLocHacks = false) {
  try {
    const data= await Store.get(key);
    return rawResponse(applyLocHacks ? fixLocationNameChanges(data) : data);
  } catch (err) {
    return errorResponse({ "message": err })
  }
}

function fixLocationNameChanges(content) {
  return content.replace(/Pondicherry/g, "Puducherry").replace(/Union Territory of /g, "");
}

const ROUTE_PREFIX = "/covid19-in";

const routeHandlers = {
  '/contacts': () => cachedData(STORE_KEYS.CACHED_CONTACTS),
  '/stats': () => cachedData(STORE_KEYS.CACHED_CASE_COUNTS),
  '/stats/latest': () => cachedData(STORE_KEYS.CACHED_CASE_COUNTS, true),
  '/stats/daily': () => cachedData(STORE_KEYS.CACHED_CASE_COUNTS_HISTORY, true),
  '/stats/hospitals': () => cachedData(STORE_KEYS.CACHED_HOSPITAL_BEDS_COUNT),
  '/notifications': () => cachedData(STORE_KEYS.CACHED_NOTIFICATIONS),
  '/unofficial/sources': getAllUnofficialSources,
  '/unofficial/covid19india.org': () =>
      cachedData(STORE_KEYS.CACHED_UNOFFICIAL_SRC_PREFIX + "covid19india.org"),
  '/unofficial/covid19india.org/statewise': () =>
      cachedData(STORE_KEYS.CACHED_UNOFFICIAL_SRC_PREFIX + "covid19india.org_statewise"),
  '/unofficial/covid19india.org/statewise/history': () =>
      cachedData(STORE_KEYS.CACHED_UNOFFICIAL_SRC_PREFIX + "covid19india.org_statewise_history"),
  '/unofficial/covid19india.org/travelhistory': () =>
      cachedData(STORE_KEYS.CACHED_UNOFFICIAL_SRC_PREFIX + "covid19india.org_travelhistory"),
  '/refresh': refreshAllOfficialSources
};
