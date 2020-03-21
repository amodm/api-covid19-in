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

async function cachedData(key) {
  try {
    return rawResponse(await Store.get(key));
  } catch (err) {
    return errorResponse({ "message": err })
  }
}

const ROUTE_PREFIX = "/covid19-in";

const routeHandlers = {
  '/contacts': () => cachedData(STORE_KEYS.CACHED_CONTACTS),
  '/stats': () => cachedData(STORE_KEYS.CACHED_CASE_COUNTS),
  '/stats/latest': () => cachedData(STORE_KEYS.CACHED_CASE_COUNTS),
  '/stats/daily': () => cachedData(STORE_KEYS.CACHED_CASE_COUNTS_HISTORY),
  '/stats/hospitals': () => cachedData(STORE_KEYS.CACHED_HOSPITAL_BEDS_COUNT),
  '/notifications': () => cachedData(STORE_KEYS.CACHED_NOTIFICATIONS),
  '/unofficial/sources': getAllUnofficialSources,
  '/unofficial/covid19india.org': () =>
      cachedData(STORE_KEYS.CACHED_UNOFFICIAL_SRC_PREFIX + "covid19india.org"),
  '/unofficial/covid19india.org/statewise': () =>
      cachedData(STORE_KEYS.CACHED_UNOFFICIAL_SRC_PREFIX + "covid19india.org_statewise"),
  '/unofficial/covid19india.org/statewise/history': () =>
      cachedData(STORE_KEYS.CACHED_UNOFFICIAL_SRC_PREFIX + "covid19india.org_statewise_history"),
  '/refresh': refreshAllOfficialSources
};
