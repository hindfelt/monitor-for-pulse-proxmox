import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { backupState, guestDot } from '@/components/GuestCard';
import { Screen } from '@/components/Screen';
import { Card, Dot, Empty, LiveBadge, Sparkline, s } from '@/components/ui';
import { history } from '@/lib/api';
import { adviceFor, hasNoBackup, issuesFor } from '@/lib/attention';
import { forecastText, daysUntilFull } from '@/lib/forecast';
import { fmtAgo, fmtBytes, fmtDuration, fmtPct, isRunning, kindLabel, pct, tone, uptimeOf } from '@/lib/format';
import { useStore } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import type { HistoryPoint, Resource } from '@/lib/types';

const RANGES = ['1h', '24h', '7d'] as const;
type Range = (typeof RANGES)[number];
type Metric = 'cpu' | 'memory' | 'disk';

function useHistory(g: Resource | undefined, metric: Metric, range: string) {
  const conn = useStore((x) => x.conn);
  const target = g?.metricsTarget;
  const key = target ? `${target.resourceType}|${target.resourceId}|${metric}|${range}` : '';
  // Results are tagged with the request they answer, so a stale response never shows under a new range.
  const [result, setResult] = useState<{ key: string; points: HistoryPoint[] }>();
  useEffect(() => {
    if (!conn || !target) return;
    let live = true;
    history(conn, target, metric, range)
      .then((points) => live && setResult({ key, points }))
      .catch(() => live && setResult({ key, points: [] }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn, key]);
  return result?.key === key ? result.points : undefined;
}

function MetricChart({ g, metric, label, range }: { g: Resource; metric: Metric; label: string; range: Range }) {
  const t = useTheme();
  const points = useHistory(g, metric, range);
  const m = g.metrics?.[metric];
  const v = pct(m);
  return (
    <Card>
      <View style={[s.row, { marginBottom: 6 }]}>
        <Text style={{ color: t.muted }}>{label}</Text>
        <Text style={{ color: t.muted, fontSize: 12, marginLeft: 'auto' }}>{m?.total ? `${fmtBytes(m.used)} / ${fmtBytes(m.total)}` : ''}</Text>
        <Text style={{ color: t[tone(v)], fontWeight: '700', fontSize: 16, fontVariant: ['tabular-nums'] }}>{fmtPct(v)}</Text>
      </View>
      {points && points.length > 1 ? (
        <Sparkline points={points} tone={tone(v)} />
      ) : (
        <View style={{ height: 56, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: t.muted, fontSize: 12 }}>{points ? 'No history yet' : 'Loading history…'}</Text>
        </View>
      )}
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: t.line, gap: 12 }}>
      <Text style={{ color: t.muted }}>{label}</Text>
      {typeof children === 'string' ? <Text style={{ color: t.fg, fontWeight: '600', flexShrink: 1, textAlign: 'right' }}>{children}</Text> : children}
    </View>
  );
}

function FixList({ g }: { g: Resource }) {
  const t = useTheme();
  const issues = issuesFor(g);
  // Pulse stores the Proxmox web address on the node, not on each guest.
  const pveUrl = useStore((x) => x.nodes.find((n) => n.id === g.parentId)?.proxmox?.host) || g.proxmox?.host;
  if (!issues.length) return null;
  return (
    <>
      <Text style={{ color: t.muted, fontSize: 11.5, fontWeight: '600', letterSpacing: 0.9, marginHorizontal: 4, marginBottom: 8 }} accessibilityRole="header">
        WHAT NEEDS FIXING
      </Text>
      {issues.map((i) => {
        const a = adviceFor(i.code, g);
        return (
          <Card key={i.code} accent={t[i.severity]}>
            <Text style={{ color: t.fg, fontWeight: '700', fontSize: 15 }}>{a.title}</Text>
            {i.text !== a.title ? <Text style={{ color: t[i.severity], fontSize: 13.5, fontWeight: '600', marginTop: 2 }}>{i.text}</Text> : null}
            <Text style={{ color: t.muted, fontSize: 13, lineHeight: 19, marginTop: 6 }}>{a.fix}</Text>
          </Card>
        );
      })}
      {pveUrl ? (
        <Pressable
          onPress={() => Linking.openURL(pveUrl)}
          accessibilityRole="link"
          style={({ pressed }) => ({ backgroundColor: t.accent, opacity: pressed ? 0.8 : 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center', marginBottom: 14 })}
        >
          <Text style={{ color: t.onAccent, fontWeight: '700' }}>Open Proxmox ↗</Text>
        </Pressable>
      ) : (
        <View style={{ height: 6 }} />
      )}
    </>
  );
}

export default function GuestDetail() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const g = useStore((x) => x.guests.find((r) => r.id === id));
  const loaded = useStore((x) => x.loaded);
  const [range, setRange] = useState<Range>('24h');
  const diskWeek = useHistory(g, 'disk', '7d');
  const forecast = forecastText(daysUntilFull(diskWeek ?? []));
  const web = g?.customUrl || g?.proxmox?.guestUrl;
  const backup = g ? backupState(g) : undefined;

  return (
    <>
      <Stack.Screen options={{ title: g?.name ?? '', headerRight: () => <LiveBadge /> }} />
      <Screen top={false}>
        {!g ? (
          <Empty>{loaded ? 'Guest not found.' : 'Loading…'}</Empty>
        ) : (
          <>
            <View style={s.row}>
              <Dot state={guestDot(g)} />
              <Text style={{ color: t.fg, fontSize: 28, fontWeight: '800', letterSpacing: -0.5, flexShrink: 1 }}>{g.name}</Text>
            </View>
            <Text style={{ color: t.muted, fontSize: 13, marginTop: 4, marginBottom: 14 }}>
              {isRunning(g) ? 'Running' : g.status} · {kindLabel(g)}{g.proxmox?.vmid ? ` ${g.proxmox.vmid}` : ''} · {g.parentName || g.proxmox?.nodeName}
              {isRunning(g) ? ` · up ${fmtDuration(uptimeOf(g))}` : ''}
            </Text>

            <FixList g={g} />

            <View style={{ flexDirection: 'row', backgroundColor: t.card2, borderRadius: 10, padding: 3, marginVertical: 6 }} accessibilityRole="tablist">
              {RANGES.map((r) => (
                <Pressable
                  key={r}
                  onPress={() => setRange(r)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: range === r }}
                  style={{ flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center', backgroundColor: range === r ? t.card : 'transparent' }}
                >
                  <Text style={{ color: range === r ? t.fg : t.muted, fontWeight: range === r ? '600' : '400', fontSize: 13 }}>{r}</Text>
                </Pressable>
              ))}
            </View>

            <MetricChart g={g} metric="cpu" label="CPU" range={range} />
            <MetricChart g={g} metric="memory" label="Memory" range={range} />
            <MetricChart g={g} metric="disk" label="Disk" range={range} />
            {forecast ? <Text style={{ color: t.warn, fontSize: 12.5, marginHorizontal: 4, marginBottom: 10 }}>{forecast} (based on the last 7 days)</Text> : null}

            <Card style={{ paddingVertical: 2 }}>
              <Row label="Last backup">
                <Text style={{ color: backup ? t[backup.tone] : t.fg, fontWeight: '600' }}>
                  {g.proxmox?.backupInProgress ? 'running now' : hasNoBackup(g) ? 'never' : fmtAgo(g.proxmox?.lastBackup)}
                </Text>
              </Row>
              {g.proxmox?.cpus ? <Row label="Cores">{String(g.proxmox.cpus)}</Row> : null}
              {g.metrics?.memory?.total ? <Row label="Memory">{fmtBytes(g.metrics.memory.total)}</Row> : null}
              {g.metrics?.disk?.total ? <Row label="Disk">{fmtBytes(g.metrics.disk.total)}</Row> : null}
              {g.tags?.length ? <Row label="Tags">{g.tags.join(', ')}</Row> : null}
              {web ? (
                <Row label="Web UI">
                  <Pressable onPress={() => Linking.openURL(web)} accessibilityRole="link" hitSlop={8}>
                    <Text style={{ color: t.accent, fontWeight: '600' }}>Open ↗</Text>
                  </Pressable>
                </Row>
              ) : null}
            </Card>
          </>
        )}
      </Screen>
    </>
  );
}
