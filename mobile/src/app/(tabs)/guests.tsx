import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, Text, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GuestCard } from '@/components/GuestCard';
import { Empty, Header } from '@/components/ui';
import { hasIssues } from '@/lib/attention';
import { isRunning } from '@/lib/format';
import { defaultDesc, issueCounts, SORT_KEYS, SORT_LABEL, sortGuests, type SortKey } from '@/lib/sort';
import { refresh, useStore } from '@/lib/store';
import { useTheme } from '@/lib/theme';

type Filter = 'all' | 'attention' | 'stopped';

function Chip({ label, on, onPress, hint }: { label: string; on: boolean; onPress: () => void; hint?: string }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityHint={hint}
      style={{ paddingHorizontal: 13, paddingVertical: 7, borderRadius: 99, borderWidth: 0.5, borderColor: on ? t.accent : t.line, backgroundColor: on ? t.accent : t.card }}
    >
      <Text style={{ color: on ? t.onAccent : t.muted, fontWeight: on ? '600' : '400', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export default function Guests() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const guests = useStore((s) => s.guests);
  const loaded = useStore((s) => s.loaded);
  const [query, setQuery] = useState('');
  // Filter lives in the route so Home's "Backups overdue" card can open this tab pre-filtered.
  const params = useLocalSearchParams<{ filter?: string }>();
  const filter: Filter = params.filter === 'attention' || params.filter === 'stopped' ? params.filter : 'all';
  const setFilter = (f: Filter) => router.setParams({ filter: f });
  const alerts = useStore((s) => s.alerts);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'name', desc: false });
  const [pulling, setPulling] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('guests.sort').then((v) => {
      const [key, dir] = (v ?? '').split(':') as [SortKey, string];
      if (SORT_KEYS.includes(key)) setSort({ key, desc: dir ? dir === 'desc' : defaultDesc(key) });
    });
  }, []);
  // Tap a new key: its natural order (highest first). Tap the active key again: flip.
  const pickSort = (key: SortKey) => {
    const next = { key, desc: key === sort.key ? !sort.desc : defaultDesc(key) };
    setSort(next);
    AsyncStorage.setItem('guests.sort', `${next.key}:${next.desc ? 'desc' : 'asc'}`);
  };

  const issues = useMemo(() => issueCounts(guests, alerts), [guests, alerts]);

  const counts = useMemo(
    () => ({ all: guests.length, attention: guests.filter(hasIssues).length, stopped: guests.filter((g) => !isRunning(g)).length }),
    [guests],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return guests
      .filter((g) => {
        if (filter === 'attention' && !hasIssues(g)) return false;
        if (filter === 'stopped' && isRunning(g)) return false;
        if (!q) return true;
        return g.name.toLowerCase().includes(q) || String(g.proxmox?.vmid ?? '').includes(q) || (g.tags ?? []).some((x) => x.toLowerCase().includes(q));
      });
  }, [guests, query, filter]);
  const sorted = useMemo(() => sortGuests(visible, sort.key, sort.desc, issues), [visible, sort, issues]);

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 14, paddingBottom: insets.bottom + 100 }}
      data={loaded ? sorted : []}
      keyExtractor={(g) => g.id}
      renderItem={({ item }) => <GuestCard guest={item} issueCount={sort.key === 'issues' ? issues.get(item.id) : undefined} />}
      extraData={sort.key}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      refreshControl={<RefreshControl refreshing={pulling} onRefresh={() => { setPulling(true); refresh().finally(() => setPulling(false)); }} tintColor={t.muted} />}
      ListHeaderComponent={
        <>
          <Header title="Guests" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search name, VMID or tag"
            placeholderTextColor={t.muted}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
            returnKeyType="search"
            accessibilityLabel="Search guests"
            style={{ backgroundColor: t.card, borderColor: t.line, borderWidth: 0.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, color: t.fg, fontSize: 16, marginBottom: 10 }}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 8 }}>
            <Chip label={`All ${counts.all}`} on={filter === 'all'} onPress={() => setFilter('all')} />
            <Chip label={`Attention ${counts.attention}`} on={filter === 'attention'} onPress={() => setFilter('attention')} />
            <Chip label={`Stopped ${counts.stopped}`} on={filter === 'stopped'} onPress={() => setFilter('stopped')} />
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 12, alignItems: 'center' }}>
            <Text style={{ color: t.muted, fontSize: 12, marginRight: 2 }}>Sort by</Text>
            {SORT_KEYS.map((k) => {
              const on = sort.key === k;
              const arrow = on ? (k === 'name' ? (sort.desc ? ' Z–A' : ' A–Z') : sort.desc ? ' ↓' : ' ↑') : '';
              return <Chip key={k} label={`${SORT_LABEL[k]}${arrow}`} on={on} onPress={() => pickSort(k)} hint={on ? 'Reverses the order' : undefined} />;
            })}
          </ScrollView>
        </>
      }
      ListEmptyComponent={<Empty>{loaded ? 'No guests match.' : 'Loading…'}</Empty>}
    />
  );
}
