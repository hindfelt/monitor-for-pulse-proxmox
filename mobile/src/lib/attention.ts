import { GUEST_TYPES, needsAttention, pct, reasonLabel, reasonText } from './format.ts';
import type { Alert, Resource } from './types';

/** App-side disk warning; Pulse's own thresholds can be higher than you'd want on a phone glance. */
export const DISK_WARN = 85;
export const DISK_BAD = 95;

export interface Issue {
  resource?: Resource;
  name: string;
  code: string;
  text: string;
  severity: 'warn' | 'bad';
}

/**
 * True when Pulse has no completed backup time for a Proxmox guest: the red ✗ shield in Pulse 6.6.
 * Go serialises an unset time as "0001-01-01T00:00:00Z", which parses to a negative timestamp.
 */
export function hasNoBackup(r: Resource): boolean {
  if (!GUEST_TYPES.includes(r.type) || !r.proxmox) return false;
  const last = r.proxmox.lastBackup;
  if (!last) return true;
  const t = Date.parse(last);
  return Number.isFinite(t) && t <= 0;
}

export function issuesFor(r: Resource): Issue[] {
  const out: Issue[] = [];
  // Pulse's health verdict doesn't include "never backed up", but Pulse's own guest table shows it red.
  if (hasNoBackup(r) && !r.proxmox?.backupInProgress) {
    out.push({ resource: r, name: r.name, code: 'backup_missing', text: 'No completed backup reported', severity: 'bad' });
  }
  const bad = r.health?.verdict === 'critical';
  if (needsAttention(r)) {
    const reasons = r.health?.reasons ?? [];
    if (!reasons.length) out.push({ resource: r, name: r.name, code: 'other', text: 'Needs attention', severity: bad ? 'bad' : 'warn' });
    for (const x of reasons) {
      if (x.code === 'backup_stale' && out.some((i) => i.code === 'backup_missing')) continue;
      out.push({ resource: r, name: r.name, code: x.code, text: reasonText(x.code, x.detail), severity: bad ? 'bad' : 'warn' });
    }
  }
  const disk = pct(r.metrics?.disk);
  if (disk !== undefined && disk >= DISK_WARN) {
    out.push({ resource: r, name: r.name, code: 'disk_high', text: `Disk ${Math.round(disk)}% full`, severity: disk >= DISK_BAD ? 'bad' : 'warn' });
  }
  return out;
}

export const hasIssues = (r: Resource) => issuesFor(r).length > 0;

const GROUP_TITLE: Record<string, string> = {
  backup_stale: 'Backups overdue',
  backup_missing: 'No backup',
  disk_high: 'Disks filling up',
  telemetry_stale: 'Stale readings',
};

export interface AttentionCard {
  key: string;
  title: string;
  detail: string;
  severity: 'warn' | 'bad';
  /** Single resource → open it; group → open the filtered guest list. */
  resource?: Resource;
  alert?: Alert;
  group?: boolean;
}

const GROUP_MIN = 3;

/** Turns issues into cards, folding 3+ of the same kind into one card so one noisy rule can't bury the rest. */
export function attentionCards(resources: Resource[], alerts: Alert[]): { cards: AttentionCard[]; affected: number } {
  const issues = resources.flatMap(issuesFor);
  const seen = new Set(issues.map((i) => i.resource?.id));
  for (const a of alerts) {
    if (a.acknowledged || seen.has(a.resourceId)) continue;
    issues.push({ name: a.resourceName, code: 'alert', text: a.summary || a.message, severity: a.level === 'critical' ? 'bad' : 'warn' });
  }
  const affected = new Set(issues.map((i) => i.resource?.id ?? `alert:${i.name}`)).size;

  const byCode = new Map<string, Issue[]>();
  for (const i of issues) byCode.set(i.code, [...(byCode.get(i.code) ?? []), i]);

  const cards: AttentionCard[] = [];
  for (const [code, list] of byCode) {
    const severity = list.some((i) => i.severity === 'bad') ? 'bad' : 'warn';
    if (list.length >= GROUP_MIN && code !== 'alert') {
      const names = list.map((i) => i.name).sort((a, b) => a.localeCompare(b));
      cards.push({
        key: `group:${code}`,
        title: `${GROUP_TITLE[code] ?? reasonLabel(code)} · ${list.length}`,
        detail: names.join(', '),
        severity,
        group: true,
      });
    } else {
      for (const i of list) cards.push({ key: `${code}:${i.resource?.id ?? i.name}`, title: i.name, detail: i.text, severity: i.severity, resource: i.resource });
    }
  }
  // Critical first, then single items (more specific) before groups.
  cards.sort((a, b) => Number(b.severity === 'bad') - Number(a.severity === 'bad') || Number(!!a.group) - Number(!!b.group));
  return { cards, affected };
}

export interface Advice {
  title: string;
  fix: string;
}

/** Plain-language explanation and next step for each kind of issue. */
export function adviceFor(code: string, r?: Resource): Advice {
  const kind = r?.type === 'vm' ? 'VM' : r?.type === 'system-container' ? 'container' : 'guest';
  switch (code) {
    case 'backup_stale':
      return {
        title: 'Backup is overdue',
        fix: `In Proxmox, check that a backup job (Datacenter → Backup) includes this ${kind} and that its last run succeeded. To back up right away: select the ${kind} → Backup → Backup now.`,
      };
    case 'backup_missing':
      return {
        title: 'Never backed up',
        fix: `Pulse has no completed backup for this ${kind}. In Proxmox, add it to a backup job (Datacenter → Backup → edit the job → Selection), then select the ${kind} → Backup → Backup now to make the first one.`,
      };
    case 'disk_high':
      return {
        title: 'Disk is almost full',
        fix: `Free up space inside the ${kind} (old logs, Docker images, caches), or give it more space in Proxmox: select the ${kind} → ${r?.type === 'vm' ? 'Hardware' : 'Resources'} → the disk → Disk Action → Resize.`,
      };
    case 'resource_risk':
      return { title: 'Running low on resources', fix: 'Check the CPU, memory and disk charts below to see which one is close to its limit.' };
    case 'telemetry_stale':
    case 'telemetry_missing':
      return {
        title: 'Pulse is not getting fresh readings',
        fix: r?.type === 'vm'
          ? 'Make sure the QEMU guest agent is installed and running inside the VM, and enabled under Options → QEMU Guest Agent in Proxmox.'
          : 'Check that Pulse can still reach the Proxmox node (Pulse → Settings → Infrastructure).',
      };
    case 'powered_off':
      return { title: 'Stopped', fix: `The ${kind} is not running. Start it from Proxmox if it should be.` };
    case 'availability_failed':
      return { title: 'Availability check failing', fix: 'A service check for this resource is failing. See the details in Pulse.' };
    case 'critical_alert':
    case 'warning_alert':
    case 'critical_incident':
      return { title: 'Active alert', fix: 'See the Alerts tab, and acknowledge it in Pulse once handled.' };
    default:
      return { title: reasonLabel(code), fix: 'Open Pulse for details.' };
  }
}
