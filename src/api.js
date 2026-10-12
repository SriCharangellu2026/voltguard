function backendOfflineError() {
  const error = new Error(
    'The VoltGuard backend is offline. Safety results are unavailable until the API is reachable. Start the server, then reload this page.',
  );
  error.code = 'BACKEND_OFFLINE';
  return error;
}

function asRequestError(err) {
  if (err?.name === 'AbortError') return err;
  const message = String(err?.message || '');
  const offline = (typeof navigator !== 'undefined' && navigator.onLine === false)
    || err instanceof TypeError
    || /failed to fetch|networkerror|load failed|network request failed/i.test(message);
  if (offline) return backendOfflineError();
  return err instanceof Error ? err : new Error('The request could not be completed.');
}

async function request(path, { method = 'GET', body, signal } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      signal,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw asRequestError(err);
  }

  if (res.status === 502 || res.status === 503 || res.status === 504) {
    throw backendOfflineError();
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = Array.isArray(data.details) && data.details.length ? `: ${data.details.join('; ')}` : '';
    throw new Error(`${data.error || `Request failed (${res.status})`}${detail}`);
  }
  return data;
}

export const fetchStandards = (signal) => request('/api/standards', { signal });

export const runAudit = (payload, signal) => request('/api/audit', { method: 'POST', body: payload, signal });

export const verifyRecord = (record) => request('/api/verify', { method: 'POST', body: { record } });
