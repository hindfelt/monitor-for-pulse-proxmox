import { mockResponse } from './mock';
import { HTTPS_REQUIRED, isHttps } from './url';
import type { Alert, HistoryPoint, Resource, ResourcesResponse } from './types';

export interface Connection {
  url: string; // e.g. https://pulse.example.com
  token: string; // monitoring:read API token
  demo?: boolean;
}

export { normalizeUrl } from './url';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const TIMEOUT_MS = 10_000;

const qs = (o: Record<string, string>) =>
  Object.entries(o)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

async function get<T>(conn: Connection, path: string): Promise<T> {
  if (conn.demo) {
    // Avoid URL/URLSearchParams: React Native's polyfills are incomplete.
    const [pathname, query = ''] = path.split('?');
    const params = new Map(
      query.split('&').filter(Boolean).map((kv) => kv.split('=').map(decodeURIComponent) as [string, string]),
    );
    const body = mockResponse(pathname, { get: (k: string) => params.get(k) ?? null });
    if (body === undefined) throw new ApiError(404, 'Not found');
    return body as T;
  }
  const ctrl = new AbortController();
  if (!isHttps(conn.url)) throw new ApiError(0, HTTPS_REQUIRED);
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let r: Response;
  try {
    r = await fetch(conn.url.replace(/\/+$/, '') + path, {
      headers: { 'X-API-Token': conn.token, Accept: 'application/json' },
      signal: ctrl.signal,
    });
  } catch {
    throw new ApiError(0, ctrl.signal.aborted ? 'Pulse did not answer in time.' : "Can't reach Pulse. Check the address, your network or VPN, and that its HTTPS certificate is valid.");
  } finally {
    clearTimeout(timer);
  }
  if (!r.ok) {
    if (r.status === 401 || r.status === 403) throw new ApiError(r.status, 'Pulse rejected the API token. It needs the monitoring:read scope.');
    let msg = `Pulse returned HTTP ${r.status}`;
    try {
      const b = await r.json();
      msg = b.message || b.error || msg;
    } catch {}
    throw new ApiError(r.status, msg);
  }
  return (await r.json()) as T;
}

export async function listResources(conn: Connection, types: string[]): Promise<Resource[]> {
  const out: Resource[] = [];
  for (let page = 1; page <= 50; page++) {
    const q = qs({ type: types.join(','), limit: '100', page: String(page) });
    const res = await get<ResourcesResponse>(conn, `/api/resources?${q}`);
    out.push(...(res.data ?? []));
    if (!res.meta || page >= res.meta.totalPages) break;
  }
  return out;
}

export async function activeAlerts(conn: Connection): Promise<Alert[]> {
  const res = await get<Alert[] | { alerts?: Alert[] }>(conn, '/api/alerts/active');
  return Array.isArray(res) ? res : res.alerts ?? [];
}

export async function version(conn: Connection): Promise<string | undefined> {
  return (await get<{ version?: string }>(conn, '/api/version')).version;
}

export async function history(
  conn: Connection,
  target: { resourceType: string; resourceId: string },
  metric: 'cpu' | 'memory' | 'disk',
  range: string,
): Promise<HistoryPoint[]> {
  const q = qs({ ...target, metric, range, maxPoints: '120' });
  const res = await get<{ points?: HistoryPoint[] }>(conn, `/api/metrics-store/history?${q}`);
  return (res.points ?? [])
    .map((p) => ({ timestamp: p.timestamp < 1e12 ? p.timestamp * 1000 : p.timestamp, value: p.value }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

/** Checks URL + token by making one authenticated read. */
export async function testConnection(conn: Connection): Promise<string> {
  await listResources({ ...conn }, ['agent']);
  return (await version(conn).catch(() => undefined)) ?? 'unknown version';
}
