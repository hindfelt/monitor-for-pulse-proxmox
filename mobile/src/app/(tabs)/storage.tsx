import { Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Bar, Card, Dot, Empty, Header, Tag, s } from '@/components/ui';
import { fmtBytes, isRunning, pct, tone } from '@/lib/format';
import { useStore } from '@/lib/store';
import { useTheme } from '@/lib/theme';

export default function Storage() {
  const t = useTheme();
  const storage = useStore((x) => x.storage);
  const loaded = useStore((x) => x.loaded);
  const sorted = [...storage].sort((a, b) => (pct(b.metrics?.disk) ?? 0) - (pct(a.metrics?.disk) ?? 0));
  return (
    <Screen>
      <Header title="Storage" />
      {!loaded ? <Empty>Loading…</Empty> : sorted.length === 0 ? <Empty>No storage reported.</Empty> : sorted.map((st) => {
        const d = st.metrics?.disk;
        const v = pct(d);
        return (
          <Card key={st.id}>
            <View style={s.row}>
              <Dot state={isRunning(st) ? tone(v) : 'off'} />
              <Text style={{ color: t.fg, fontWeight: '650' as never, fontSize: 15.5, flexShrink: 1 }} numberOfLines={1}>{st.name}</Text>
              {st.storage?.type ? <Tag label={st.storage.type} color={t.muted} /> : null}
              {st.storage?.shared ? <Tag label="shared" color={t.muted} /> : null}
              <Text style={{ color: t.muted, fontSize: 12, marginLeft: 'auto' }}>{st.parentName}</Text>
            </View>
            <View style={{ marginTop: 10 }}>
              <Bar label={`${fmtBytes(d?.used)} of ${fmtBytes(d?.total)}`} value={v} />
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}
