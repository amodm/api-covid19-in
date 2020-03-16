import { Store } from './store';
import { STORE_KEYS } from './constants';

export async function fetchTimestamps() {
    return Promise.all([Store.get(STORE_KEYS.LAST_REFRESHED), Store.get(STORE_KEYS.LAST_UPDATED_ORIGIN)]);
}

export async function successResponse(data, timestampsPromise) {
    const timestamps = await timestampsPromise;
    console.log(timestamps);
    const output = {
        'success': true,
        'data': data,
        'lastRefreshed': new Date(parseInt(timestamps[0])).toISOString(),
        'lastOriginUpdate': new Date(parseInt(timestamps[1])).toISOString()
    };
    return new Response(JSON.stringify(output), { headers: standardHeaders });
}

export async function errorResponse(details, timestampsPromise, status = 500) {
    const timestamps = await timestampsPromise;
    const output = {
        'success': false,
        'error': details,
        'lastRefreshed': new Date(parseInt(timestamps[0])).toISOString(),
        'lastOriginUpdate': new Date(parseInt(timestamps[1])).toISOString()
    };
    return new Response(JSON.stringify(output), { headers: standardHeaders });
}

const standardHeaders = {
    'Content-Type': 'application/json; charset=utf-8'
};