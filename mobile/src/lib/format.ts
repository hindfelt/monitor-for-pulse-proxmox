import type { MetricValue, Resource } from './types';

/** Same rule Pulse uses (unified_ai_adapter.go metricPercent). Undefined = no reading. */
export function pct(m?: MetricValue): number | undefined {
  if (!m) return undefined;
  if (m.percent && m.percent > 0) return m.percent;
  if (m.value > 0) return m.value;
  if (m.total && m.used !== undefined && m.total > 0) return (m.used / m.total) * 100;
  return 0;
}

export function fmtPct(v?: number): string {
  if (v === undefined) return '—';
  if (v > 0 && v < 1) return '<1%';
  return `${Math.round(v)}%`;
}

export function fmtBytes(b?: number): string {
  if (b === undefined) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) {
    b /= 1024;
    i++;
  }
  return `${b >= 100 || i === 0 ? Math.round(b) : b.toFixed(1)} ${u[i]}`;
}

/** Guests report uptime on the Proxmox facet; nodes/agents on the resource itself. */
export const uptimeOf = (r: Resource) => r.uptime || r.proxmox?.uptime;

export function fmtDuration(seconds?: number): string {
  if (!seconds) return '—';
  const d = Math.floor(seconds / 86400);
  if (d >= 1) return `${d}d`;
  const h = Math.floor(seconds / 3600);
  if (h >= 1) return `${h}h`;
  return `${Math.max(1, Math.floor(seconds / 60))}m`;
}

export function fmtAgo(iso?: string | number): string {
  if (!iso) return 'never';
  const t = typeof iso === 'number' ? iso : Date.parse(iso);
  if (!Number.isFinite(t) || t <= 0) return 'never';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

/** Usage tone: matches Pulse's default warning/critical thresholds closely enough for colour. */
export function tone(v?: number): 'ok' | 'warn' | 'bad' {
  if (v === undefined) return 'ok';
  if (v >= 90) return 'bad';
  if (v >= 80) return 'warn';
  return 'ok';
}

/** Hottest CPU sensor in °C. Pulse omits it when the host reports no sensors, and 0 means no reading. */
export function temperatureOf(r: Resource): number | undefined {
  const c = r.temperature ?? r.proxmox?.temperature ?? r.agent?.temperature;
  return c && c > 0 ? c : undefined;
}

export function tempTone(c: number): 'ok' | 'warn' | 'bad' {
  if (c >= 85) return 'bad';
  if (c >= 70) return 'warn';
  return 'ok';
}

export const GUEST_TYPES = ['vm', 'system-container', 'oci-container'];

export function isRunning(r: Resource): boolean {
  return r.status === 'running' || r.status === 'online';
}

export function kindLabel(r: Resource): string {
  if (r.type === 'vm') return 'VM';
  if (r.type === 'system-container') return 'LXC';
  if (r.type === 'oci-container') return 'OCI';
  return r.type;
}

const REASONS: Record<string, string> = {
  backup_stale: 'Backup overdue',
  resource_risk: 'Running low on resources',
  critical_alert: 'Critical alert',
  warning_alert: 'Warning alert',
  critical_incident: 'Critical incident',
  telemetry_stale: 'Readings are stale',
  telemetry_missing: 'No readings',
  status_unknown: 'Status unknown',
  powered_off: 'Powered off',
  availability_failed: 'Availability check failing',
  offline: 'Offline',
};

const UNIT: Record<string, string> = { s: 'second', m: 'minute', h: 'hour', d: 'day', w: 'week' };

/** "7d" → "7 days". Returns undefined for anything that isn't a short duration. */
export function humanDuration(s?: string): string | undefined {
  const m = s?.trim().match(/^(\d+)\s*([smhdw])$/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  return `${n} ${UNIT[m[2].toLowerCase()]}${n === 1 ? '' : 's'}`;
}

export function reasonLabel(code: string): string {
  return REASONS[code] || code.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/** Readable text for a Pulse health reason. Pulse's `detail` can be a full sentence or a terse value like "7d". */
export function reasonText(code: string, detail?: string): string {
  const d = detail?.trim();
  if (!d) return reasonLabel(code);
  const dur = humanDuration(d);
  if (code === 'backup_stale' && dur) return `Last backup ${dur} ago`;
  if (dur) return `${reasonLabel(code)} (${dur})`;
  if (d.length <= 12) return `${reasonLabel(code)} (${d})`;
  return d;
}

export function needsAttention(r: Resource): boolean {
  const v = r.health?.verdict;
  return v === 'attention' || v === 'critical' || v === 'stale';
}
