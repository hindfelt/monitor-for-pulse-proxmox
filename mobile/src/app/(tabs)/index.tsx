import { Link, router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { GuestCard } from '@/components/GuestCard';
import { Screen } from '@/components/Screen';
import { Card, Empty, Header, LiveBadge, Ring, Section, s } from '@/components/ui';
import { attentionCards, type AttentionCard } from '@/lib/attention';
import { fmtBytes, fmtDuration, isRunning, pct, temperatureOf, tempTone, uptimeOf } from '@/lib/format';
import { useStore } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import type { Resource } from '@/lib/types';

function NodeRings({ node: n }: { node: Resource }) {
  const c = temperatureOf(n);
  // Four gauges need to fit a small phone, so they shrink a little when there's a temperature.
  const size = c === undefined ? 68 : 60;
  return (
    <>
      <Ring size={size} label="CPU" value={pct(n.metrics?.cpu)} />
      <Ring size={size} label="Memory" value={pct(n.metrics?.memory)} sub={fmtBytes(n.metrics?.memory?.total)} />
      <Ring size={size} label="Disk" value={pct(n.metrics?.disk)} sub={fmtBytes(n.metrics?.disk?.total)} />
      {c !== undefined && <Ring size={size} label="Temp" value={c} text={`${Math.round(c)}°C`} color={tempTone(c)} />}
    </>
  );
}

export default function Home() {
  const t = useTheme();
  const nodes = useStore((x) => x.nodes);
  const guests = useStore((x) => x.guests);
  const storage = useStore((x) => x.storage);
  const alerts = useStore((x) => x.alerts);
  const loaded = useStore((x) => x.loaded);

  const running = guests.filter(isRunning).length;

  const { cards: attention, affected } = useMemo(() => attentionCards([...nodes, ...guests, ...storage], alerts), [nodes, guests, storage, alerts]);

  const open = (c: AttentionCard) => {
    if (c.group) return router.navigate({ pathname: '/guests', params: { filter: 'attention' } });
    const r = c.resource;
    if (!r) return router.navigate('/alerts');
    if (r.type === 'storage') return router.navigate('/storage');
    if (r.type !== 'agent') router.push({ pathname: '/guest/[id]', params: { id: r.id } });
  };

  const busiest = useMemo(
    () => guests.filter(isRunning).sort((a, b) => (pct(b.metrics?.cpu) ?? 0) - (pct(a.metrics?.cpu) ?? 0)).slice(0, 3),
    [guests],
  );

  return (
    <Screen>
      <Header
        title="Overview"
        right={
          <View style={s.row}>
            <LiveBadge />
            <Link href="/settings" asChild>
              <Pressable accessibilityLabel="Settings" hitSlop={10}>
                <Text style={{ color: t.muted, fontSize: 22 }}>⚙︎</Text>
              </Pressable>
            </Link>
          </View>
        }
      />
      {!loaded ? (
        <Empty>Connecting to Pulse…</Empty>
      ) : (
        <>
          <View style={{ backgroundColor: t.hero, borderRadius: 20, padding: 16, borderWidth: 0.5, borderColor: t.line }}>
            <Text style={{ color: t.fg, fontSize: 21, fontWeight: '700' }}>{running} of {guests.length} guests running</Text>
            <Text style={{ color: affected ? t.warn : t.ok, fontWeight: '600', marginTop: 2 }}>
              {affected === 0 ? 'Everything looks healthy' : `${affected} ${affected === 1 ? 'thing needs' : 'things need'} attention`}
            </Text>
            {nodes.map((n) => (
              <View key={n.id} style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: t.line }}>
                <Text style={{ color: t.fg, fontWeight: '600' }}>
                  {n.name}
                  <Text style={{ color: t.muted, fontWeight: '400', fontSize: 12.5 }}>
                    {'  '}{isRunning(n) ? `up ${fmtDuration(uptimeOf(n))}` : n.status}{n.proxmox?.cpus ? ` · ${n.proxmox.cpus} cores` : ''}
                  </Text>
                </Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 10 }}>
                  <NodeRings node={n} />
                </View>
              </View>
            ))}
          </View>

          {attention.length > 0 && (
            <>
              <Section title="Needs attention" right={affected} />
              {attention.map((it) => (
                <Card key={it.key} onPress={() => open(it)} accent={t[it.severity]}>
                  <View style={s.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: t.fg, fontWeight: '650' as never, fontSize: 15 }}>{it.title}</Text>
                      <Text style={{ color: t.muted, fontSize: 12.5, marginTop: 1 }} numberOfLines={2}>{it.detail}</Text>
                    </View>
                    <Text style={{ color: t.muted, fontSize: 22 }}>›</Text>
                  </View>
                </Card>
              ))}
            </>
          )}

          <Section
            title="Busiest right now"
            right={<Link href="/guests" style={{ color: t.accent, fontSize: 13 }}>All {guests.length} ›</Link>}
          />
          {busiest.length ? busiest.map((g) => <GuestCard key={g.id} guest={g} />) : <Empty>No running guests.</Empty>}
        </>
      )}
    </Screen>
  );
}
