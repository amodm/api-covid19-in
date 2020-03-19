import { refreshAllOfficialSources } from "./refresh";
import { getContacts } from "./contacts";
import { getCaseCounts, getCaseCountsTimeseries, getHospitalCounts } from "./stats";
import { getNotifications } from "./notifications";
import { getAllUnofficialSources, getUnofficialSource } from "./unofficial";

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

const ROUTE_PREFIX = "/covid19-in";

const routeHandlers = {
  '/contacts': getContacts,
  '/stats': getCaseCounts,
  '/stats/latest': getCaseCounts,
  '/stats/daily': getCaseCountsTimeseries,
  '/stats/hospitals': getHospitalCounts,
  '/notifications': getNotifications,
  '/unofficial/sources': getAllUnofficialSources,
  '/unofficial/covid19india.org': getUnofficialSource,
  '/unofficial/covid19india.org/statewise': getUnofficialSource,
  '/refresh': refreshAllOfficialSources
};
