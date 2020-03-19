/**
 * Returns the raw response without any modification, treating @data as the body
 */
export function rawResponse(data) {
    return new Response(typeof data === 'string' ? data : JSON.stringify(data), { headers: standardHeaders });
}

export function successResponse(data) {
    const output = {
        'success': true,
        'data': data,
        'lastRefreshed': new Date().toISOString(),
        'lastOriginUpdate': new Date().toISOString()
    };
    return new Response(JSON.stringify(output), { headers: standardHeaders });
}

export async function errorResponse(details, timestampsPromise, status = 500) {
    const timestamps = timestampsPromise ? await timestampsPromise : ["0", "0"];
    const output = {
        'success': false,
        'error': details,
        'lastRefreshed': new Date(parseInt(timestamps[0])).toISOString(),
        'lastOriginUpdate': new Date(parseInt(timestamps[1])).toISOString()
    };
    return new Response(JSON.stringify(output), { headers: standardHeaders, status });
}

const standardHeaders = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
};
