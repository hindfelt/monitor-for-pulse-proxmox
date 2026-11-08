import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card, Empty, Header, Tag, s } from '@/components/ui';
import { fmtAgo } from '@/lib/format';
import { useStore } from '@/lib/store';
import { useTheme } from '@/lib/theme';

export default function Alerts() {
  const t = useTheme();
  const alerts = useStore((x) => x.alerts);
  const guests = useStore((x) => x.guests);
  const loaded = useStore((x) => x.loaded);
  const sorted = [...alerts].sort(
    (a, b) => Number(a.acknowledged) - Number(b.acknowledged) || Number(b.level === 'critical') - Number(a.level === 'critical'),
  );
  return (
    <Screen>
      <Header title="Alerts" />
      {!loaded ? <Empty>Loading…</Empty> : sorted.length === 0 ? <Empty>No active alerts 🎉</Empty> : sorted.map((a) => {
        const isGuest = guests.some((g) => g.id === a.resourceId);
        return (
          <Card
            key={a.id}
            accent={a.level === 'critical' ? t.bad : t.warn}
            style={a.acknowledged ? { opacity: 0.6 } : undefined}
            onPress={isGuest ? () => router.push({ pathname: '/guest/[id]', params: { id: a.resourceId } }) : undefined}
          >
            <View style={s.row}>
              <Text style={{ color: t.fg, fontWeight: '650' as never, fontSize: 15 }}>{a.resourceName}</Text>
              {a.acknowledged ? <Tag label="acknowledged" color={t.muted} /> : null}
            </View>
            <Text style={{ color: t.muted, fontSize: 13, marginTop: 2 }}>{a.summary || a.message}</Text>
            <Text style={{ color: t.muted, fontSize: 11, marginTop: 4 }}>since {fmtAgo(a.startTime)} · {a.node}</Text>
          </Card>
        );
      })}
      {loaded ? <Text style={{ color: t.muted, fontSize: 11, textAlign: 'center', marginTop: 8 }}>Acknowledge and manage alerts in the full Pulse interface.</Text> : null}
    </Screen>
  );
}
