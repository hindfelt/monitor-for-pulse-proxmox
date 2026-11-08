import { issuesFor } from './attention.ts';
import { pct } from './format.ts';
import type { Alert, Resource } from './types';

export type SortKey = 'issues' | 'cpu' | 'memory' | 'disk' | 'name';
export const SORT_KEYS: SortKey[] = ['issues', 'cpu', 'memory', 'disk', 'name'];
export const SORT_LABEL: Record<SortKey, string> = { issues: 'Issues', cpu: 'CPU', memory: 'Memory', disk: 'Disk', name: 'Name' };
/** Natural direction: worst/highest first for everything except name. */
export const defaultDesc = (k: SortKey) => k !== 'name';

export interface IssueCount {
  total: number;
  critical: number;
}

/** Problems needing handling for one guest: its issues plus open (unacknowledged) alerts not already covered. */
export function issueCounts(guests: Resource[], alerts: Alert[]): Map<string, IssueCount> {
  const out = new Map<string, IssueCount>();
  for (const g of guests) {
    const issues = issuesFor(g);
    out.set(g.id, { total: issues.length, critical: issues.filter((i) => i.severity === 'bad').length });
  }
  for (const a of alerts) {
    const c = out.get(a.resourceId);
    if (!c || a.acknowledged) continue;
    c.total++;
    if (a.level === 'critical') c.critical++;
  }
  return out;
}

export function sortGuests(list: Resource[], key: SortKey, desc: boolean, counts: Map<string, IssueCount>): Resource[] {
  const val = (g: Resource): number => {
    if (key === 'issues') {
      const c = counts.get(g.id);
      return c ? c.critical * 1000 + c.total : 0;
    }
    if (key === 'name') return 0;
    return pct(g.metrics?.[key]) ?? -1; // no reading sorts last
  };
  const dir = desc ? -1 : 1;
  return [...list].sort((a, b) => {
    if (key === 'name') return dir * a.name.localeCompare(b.name);
    const d = val(a) - val(b);
    return d !== 0 ? dir * d : a.name.localeCompare(b.name); // ties: alphabetical
  });
}
