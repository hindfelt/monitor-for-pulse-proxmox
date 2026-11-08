import { router } from 'expo-router';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { hasNoBackup } from '@/lib/attention';
import { fmtAgo, fmtDuration, isRunning, kindLabel, pct, uptimeOf } from '@/lib/format';
import { useTheme } from '@/lib/theme';
import type { Resource } from '@/lib/types';
import { Bar, Card, Dot, Tag } from './ui';

export function guestDot(g: Resource): 'ok' | 'warn' | 'bad' | 'off' {
  if (!isRunning(g)) return 'off';
  if (hasNoBackup(g)) return 'bad';
  const v = g.health?.verdict;
  if (v === 'critical') return 'bad';
  if (v === 'attention' || v === 'stale') return 'warn';
  return 'ok';
}

export function backupState(g: Resource): { label: string; tone: 'warn' | 'bad' } | undefined {
  if (g.proxmox?.backupInProgress) return undefined;
  if (hasNoBackup(g)) return { label: 'no backup', tone: 'bad' };
  if (!g.health?.reasons.some((r) => r.code === 'backup_stale')) return undefined;
  return { label: `backup ${fmtAgo(g.proxmox?.lastBackup)}`, tone: 'warn' };
}

export const GuestCard = memo(function GuestCard({ guest: g, issueCount }: { guest: Resource; issueCount?: { total: number; critical: number } }) {
  const t = useTheme();
  const backup = backupState(g);
  const running = isRunning(g);
  return (
    <Card onPress={() => router.push({ pathname: '/guest/[id]', params: { id: g.id } })}>
      <View style={st.head}>
        <Dot state={guestDot(g)} />
        <Text style={[st.name, { color: t.fg }]} numberOfLines={1}>{g.name}</Text>
        <Tag label={kindLabel(g)} color={t.muted} />
        {backup ? <Tag label={backup.label} color={t[backup.tone]} /> : null}
        {issueCount ? (
          <Text style={[st.right, { color: issueCount.critical ? t.bad : issueCount.total ? t.warn : t.ok, fontWeight: '600' }]}>
            {issueCount.total ? `${issueCount.total} ${issueCount.total === 1 ? 'issue' : 'issues'}` : 'OK'}
          </Text>
        ) : (
          <Text style={[st.right, { color: t.muted }]}>{running ? fmtDuration(uptimeOf(g)) : g.status}</Text>
        )}
      </View>
      {running ? (
        <View style={st.bars}>
          <Bar label="CPU" value={pct(g.metrics?.cpu)} />
          <Bar label="MEM" value={pct(g.metrics?.memory)} />
          <Bar label="DISK" value={pct(g.metrics?.disk)} />
        </View>
      ) : null}
    </Card>
  );
});

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 15.5, fontWeight: '650' as never, flexShrink: 1 },
  right: { marginLeft: 'auto', fontSize: 12, paddingLeft: 4 },
  bars: { flexDirection: 'row', gap: 12, marginTop: 10 },
});
