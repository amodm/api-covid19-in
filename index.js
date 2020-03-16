import { refreshFromSource } from "./refresh";
import { getContacts } from "./contacts";
import { getCaseCounts, getCaseCountsTimeseries } from "./stats";

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
});

async function handleRequest(request) {
  const handler = routeHandlers[new URL(request.url).pathname.substr(ROUTE_PREFIX.length)] || notFoundHandler;
  return handler(request)
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
  '/refresh': refreshFromSource
};
