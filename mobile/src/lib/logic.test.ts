/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysUntilFull, forecastText } from './forecast.ts';
import { attentionCards } from './attention.ts';
import { isHttps, normalizeUrl } from './url.ts';
import { issueCounts, sortGuests } from './sort.ts';
import { fmtBytes, fmtDuration, fmtPct, needsAttention, pct, reasonText, temperatureOf, tempTone, tone } from './format.ts';

const day = 86_400_000;
const series = (start: number, perDay: number, days = 7, n = 50) =>
  Array.from({ length: n }, (_, i) => ({ timestamp: (i / (n - 1)) * days * day, value: start + (perDay * days * i) / (n - 1) }));

test('pct follows Pulse rule: percent, then value, then used/total', () => {
  assert.equal(pct({ value: 0, percent: 42 }), 42);
  assert.equal(pct({ value: 7 }), 7);
  assert.equal(pct({ value: 0, used: 25, total: 100 }), 25);
  assert.equal(pct(undefined), undefined); // missing reading is not 0%
});

test('formatting', () => {
  assert.equal(fmtPct(0.4), '<1%');
  assert.equal(fmtPct(undefined), '—');
  assert.equal(fmtBytes(16 * 1024 ** 3), '16.0 GB');
  assert.equal(fmtDuration(118 * 86400), '118d');
  assert.equal(fmtDuration(15 * 3600), '15h');
  assert.equal(tone(88), 'warn');
  assert.equal(tone(95), 'bad');
});

test('forecast: growing disk gives days until full', () => {
  const d = daysUntilFull(series(76, 1.6));
  assert.ok(d !== undefined && d > 6 && d < 9, `got ${d}`);
  assert.match(forecastText(d)!, /about \d+ days/);
});

test('forecast: flat or shrinking disk gives no forecast', () => {
  assert.equal(daysUntilFull(series(40, 0)), undefined);
  assert.equal(daysUntilFull(series(40, -1)), undefined);
  assert.equal(daysUntilFull(series(40, 1).slice(0, 5)), undefined); // too few points
});

test('needsAttention uses Pulse health verdicts', () => {
  const r = (verdict: string) => ({ id: 'x', type: 'vm', name: 'x', status: 'running', health: { verdict, reasons: [] } }) as never;
  assert.ok(needsAttention(r('attention')));
  assert.ok(needsAttention(r('critical')));
  assert.ok(!needsAttention(r('ok')));
  assert.ok(!needsAttention(r('off')));
});


test('reasonText turns terse Pulse details into sentences', () => {
  assert.equal(reasonText('backup_stale', '7d'), 'Last backup 7 days ago');
  assert.equal(reasonText('backup_stale', '1d'), 'Last backup 1 day ago');
  assert.equal(reasonText('backup_stale', 'No backup found'), 'No backup found');
  assert.equal(reasonText('telemetry_stale', '5m'), 'Readings are stale (5 minutes)');
  assert.equal(reasonText('resource_risk'), 'Running low on resources');
  assert.equal(reasonText('some_new_code'), 'Some new code');
});

const guest = (name: string, opts: { backup?: string; disk?: number } = {}) =>
  ({
    id: name, type: 'vm', name, status: 'running',
    health: opts.backup ? { verdict: 'attention', reasons: [{ code: 'backup_stale', detail: opts.backup }] } : { verdict: 'ok', reasons: [] },
    metrics: { disk: { value: opts.disk ?? 10, percent: opts.disk ?? 10 } },
  }) as never;

test('attention: 3+ of the same issue fold into one card; disk warning is added', () => {
  const { cards, affected } = attentionCards(
    [guest('a', { backup: '7d' }), guest('b', { backup: '7d' }), guest('c', { backup: '7d', disk: 88 }), guest('d')],
    [],
  );
  assert.equal(affected, 3);
  const group = cards.find((c) => c.group);
  assert.equal(group?.title, 'Backups overdue · 3');
  assert.equal(group?.detail, 'a, b, c');
  const disk = cards.find((c) => c.title === 'c');
  assert.equal(disk?.detail, 'Disk 88% full');
  assert.ok(cards.indexOf(disk!) < cards.indexOf(group!), 'single items come before groups');
});

test('attention: never-backed-up guest is flagged even when Pulse health says ok', () => {
  const g = (lastBackup?: string) =>
    ({ id: 'cs', type: 'vm', name: 'dev-server', status: 'running', health: { verdict: 'ok', reasons: [] }, proxmox: { vmid: 105, ...(lastBackup ? { lastBackup } : {}) } }) as never;
  for (const v of [undefined, '0001-01-01T00:00:00Z']) {
    const { cards, affected } = attentionCards([g(v)], []);
    assert.equal(affected, 1);
    assert.deepEqual([cards[0].title, cards[0].detail, cards[0].severity], ['dev-server', 'No completed backup reported', 'bad']);
  }
  assert.equal(attentionCards([g(new Date().toISOString())], []).affected, 0);
  // Non-Proxmox resources (no proxmox facet) are not judged on backups.
  assert.equal(attentionCards([{ id: 'x', type: 'vm', name: 'x', status: 'running' } as never], []).affected, 0);
});

test('attention: fewer than 3 stay as individual cards', () => {
  const { cards } = attentionCards([guest('a', { backup: '7d' }), guest('b', { backup: '9d' })], []);
  assert.deepEqual(cards.map((c) => [c.title, c.detail]), [['a', 'Last backup 7 days ago'], ['b', 'Last backup 9 days ago']]);
});


test('sort: by usage puts highest first, missing readings last, ties alphabetical', () => {
  const g = (name: string, disk?: number) => ({ id: name, type: 'vm', name, status: 'running', metrics: disk === undefined ? {} : { disk: { value: disk, percent: disk } } }) as never;
  const list = [g('b', 20), g('a', 20), g('c', 88), g('d')];
  const names = (l: { name: string }[]) => l.map((x) => x.name).join('');
  assert.equal(names(sortGuests(list, 'disk', true, new Map())), 'cabd');
  assert.equal(names(sortGuests(list, 'name', false, new Map())), 'abcd');
  assert.equal(names(sortGuests(list, 'name', true, new Map())), 'dcba');
});

test('sort: by issues ranks critical first, counts open alerts', () => {
  const g = (name: string, opts: { lastBackup?: string; stale?: boolean; disk?: number }) =>
    ({
      id: name, type: 'vm', name, status: 'running',
      health: opts.stale ? { verdict: 'attention', reasons: [{ code: 'backup_stale', detail: '7d' }] } : { verdict: 'ok', reasons: [] },
      metrics: { disk: { value: opts.disk ?? 10, percent: opts.disk ?? 10 } },
      proxmox: { lastBackup: opts.lastBackup ?? new Date().toISOString() },
    }) as never;
  const guests = [g('ok', {}), g('nas', { stale: true, disk: 88 }), g('cs', { lastBackup: '0001-01-01T00:00:00Z' }), g('web', { stale: true })];
  const alerts = [{ id: 'a1', resourceId: 'web', level: 'warning', acknowledged: false }, { id: 'a2', resourceId: 'web', level: 'warning', acknowledged: true }] as never[];
  const counts = issueCounts(guests, alerts);
  assert.deepEqual(counts.get('web'), { total: 2, critical: 0 }); // stale backup + 1 open alert (acked one ignored)
  assert.deepEqual(counts.get('cs'), { total: 1, critical: 1 });
  assert.equal(sortGuests(guests, 'issues', true, counts).map((x: { name: string }) => x.name).join(','), 'cs,nas,web,ok');
});

test('temperature falls back across Pulse fields and ignores empty readings', () => {
  const base = { id: 'n', type: 'agent', name: 'n', status: 'online' };
  assert.equal(temperatureOf(base), undefined);
  assert.equal(temperatureOf({ ...base, temperature: 0 }), undefined);
  assert.equal(temperatureOf({ ...base, temperature: 48 }), 48);
  assert.equal(temperatureOf({ ...base, proxmox: { temperature: 51 } }), 51);
  assert.equal(temperatureOf({ ...base, agent: { temperature: 52 } }), 52);
  assert.equal(tempTone(69), 'ok');
  assert.equal(tempTone(70), 'warn');
  assert.equal(tempTone(85), 'bad');
});

test('addresses default to https and http is not accepted', () => {
  assert.equal(normalizeUrl(' pulse.example.com/ '), 'https://pulse.example.com');
  assert.equal(normalizeUrl('http://192.168.1.50:7655'), 'http://192.168.1.50:7655');
  assert.equal(isHttps(normalizeUrl('pulse.example.com')), true);
  assert.equal(isHttps('http://192.168.1.50:7655'), false);
  assert.equal(isHttps('https://'), false);
});
