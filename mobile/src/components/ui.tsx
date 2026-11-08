import { memo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';
import { fmtPct, tone } from '@/lib/format';
import { useStore } from '@/lib/store';
import { toneColor, useTheme } from '@/lib/theme';
import type { HistoryPoint } from '@/lib/types';

export const Dot = memo(function Dot({ state }: { state: 'ok' | 'warn' | 'bad' | 'off' }) {
  const t = useTheme();
  return <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: toneColor(t, state) }} />;
});

export const Bar = memo(function Bar({ label, value }: { label: string; value?: number }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, minWidth: 0 }} accessible accessibilityLabel={`${label} ${fmtPct(value)}`}>
      <View style={s.barRow}>
        <Text style={[s.barLabel, { color: t.muted }]} numberOfLines={1}>{label}</Text>
        <Text style={[s.barValue, { color: t.fg }]}>{fmtPct(value)}</Text>
      </View>
      <View style={[s.track, { backgroundColor: t.card2 }]}>
        <View style={[s.fill, { width: `${Math.min(100, value ?? 0)}%`, backgroundColor: toneColor(t, tone(value)) }]} />
      </View>
    </View>
  );
});

/** A percentage gauge. Pass `text` and `color` to show something else on the same 0-100 scale, such as °C. */
export const Ring = memo(function Ring({ label, value, sub, text, color, size = 68 }: { label: string; value?: number; sub?: string; text?: string; color?: 'ok' | 'warn' | 'bad'; size?: number }) {
  const t = useTheme();
  const C = 2 * Math.PI * 15;
  const shown = text ?? fmtPct(value);
  return (
    <View style={{ alignItems: 'center' }} accessible accessibilityLabel={`${label} ${shown}`}>
      <Svg width={size} height={size} viewBox="0 0 36 36">
        <Circle cx={18} cy={18} r={15} fill="none" stroke={t.card2} strokeWidth={3.5} />
        <Circle
          cx={18} cy={18} r={15} fill="none" stroke={toneColor(t, color ?? tone(value))} strokeWidth={3.5}
          strokeLinecap="round" strokeDasharray={`${(C * Math.min(100, value ?? 0)) / 100} ${C}`}
          transform="rotate(-90 18 18)"
        />
        <SvgText x={18} y={21} fontSize={8} fontWeight="700" fill={t.fg} textAnchor="middle">{shown}</SvgText>
      </Svg>
      <Text style={{ color: t.muted, fontSize: 12, marginTop: 2 }}>{label}</Text>
      {sub ? <Text style={{ color: t.muted, fontSize: 10.5, opacity: 0.8 }}>{sub}</Text> : null}
    </View>
  );
});

export const Sparkline = memo(function Sparkline({ points, tone: tn, height = 56 }: { points: HistoryPoint[]; tone: 'ok' | 'warn' | 'bad'; height?: number }) {
  const t = useTheme();
  const [w, setW] = useState(0);
  if (points.length < 2) return <View style={{ height }} />;
  const t0 = points[0].timestamp;
  const span = points[points.length - 1].timestamp - t0 || 1;
  const max = Math.max(5, ...points.map((p) => p.value)) * 1.1;
  const d = points
    .map((p, i) => `${i ? 'L' : 'M'}${(((p.timestamp - t0) / span) * w).toFixed(1)} ${(height - (p.value / max) * (height - 4) - 2).toFixed(1)}`)
    .join(' ');
  const c = toneColor(t, tn);
  return (
    <View style={{ height }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 && (
        <Svg width={w} height={height}>
          <Path d={`${d} L${w} ${height} L0 ${height}Z`} fill={c} fillOpacity={0.14} />
          <Path d={d} fill="none" stroke={c} strokeWidth={2} strokeLinejoin="round" />
        </Svg>
      )}
    </View>
  );
});

export function Card({ children, onPress, style, accent }: { children: ReactNode; onPress?: () => void; style?: ViewStyle; accent?: string }) {
  const t = useTheme();
  const base: ViewStyle[] = [
    s.card,
    { backgroundColor: t.card, borderColor: t.line },
    accent ? { borderLeftWidth: 4, borderLeftColor: accent } : {},
    style ?? {},
  ];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [...base, pressed && { backgroundColor: t.card2, transform: [{ scale: 0.99 }] }]} accessibilityRole="button">
      {children}
    </Pressable>
  );
}

// One shared 1-second clock for every "x seconds ago" label, running only while something displays it.
let clockNow = Date.now();
let clockTimer: ReturnType<typeof setInterval> | undefined;
const clockListeners = new Set<() => void>();
function subscribeClock(l: () => void) {
  clockListeners.add(l);
  if (!clockTimer) clockTimer = setInterval(() => { clockNow = Date.now(); clockListeners.forEach((f) => f()); }, 1000);
  return () => {
    clockListeners.delete(l);
    if (!clockListeners.size && clockTimer) { clearInterval(clockTimer); clockTimer = undefined; }
  };
}
const useNow = () => useSyncExternalStore(subscribeClock, () => clockNow);

export function LiveBadge() {
  const t = useTheme();
  const lastUpdate = useStore((s) => s.lastUpdate);
  const error = useStore((s) => s.error);
  const now = useNow();
  const age = Math.round((now - lastUpdate) / 1000);
  const state = error ? 'bad' : !lastUpdate || age > 30 ? 'warn' : 'ok';
  const label = error ? 'offline' : !lastUpdate ? 'connecting' : age < 3 ? 'live' : age < 120 ? `${age}s ago` : `${Math.round(age / 60)} min ago`;
  return (
    <View style={[s.pill, { backgroundColor: t.card2 }]} accessibilityRole="text" accessibilityLabel={`Data ${label}`}>
      <Dot state={state} />
      <Text style={{ color: error ? t.bad : t.muted, fontSize: 12 }}>{label}</Text>
    </View>
  );
}

export function Header({ title, right }: { title: string; right?: ReactNode }) {
  const t = useTheme();
  const error = useStore((s) => s.error);
  return (
    <>
      <View style={s.header}>
        <Text style={[s.h1, { color: t.fg }]} accessibilityRole="header">{title}</Text>
        {right ?? <LiveBadge />}
      </View>
      {error ? (
        <View style={[s.banner, { backgroundColor: t.bad + '22' }]} accessibilityRole="alert">
          <Text style={{ color: t.bad, fontSize: 13 }}>{error}</Text>
        </View>
      ) : null}
    </>
  );
}

export function Section({ title, right }: { title: string; right?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={s.section}>
      <Text style={[s.sectionText, { color: t.muted }]}>{title.toUpperCase()}</Text>
      {typeof right === 'string' || typeof right === 'number' ? <Text style={[s.sectionText, { color: t.muted }]}>{right}</Text> : right}
    </View>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={{ color: t.muted, textAlign: 'center', paddingVertical: 40 }}>{children}</Text>;
}

export function Tag({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ backgroundColor: color + '22', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 }}>
      <Text style={{ color, fontSize: 10.5, fontWeight: '600' }} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export const s = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8 },
  barRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4, gap: 6 },
  barLabel: { fontSize: 11, flexShrink: 1 },
  barValue: { fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, marginBottom: 14, marginHorizontal: 2 },
  h1: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  banner: { borderRadius: 12, padding: 12, marginBottom: 12 },
  section: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 20, marginBottom: 8, marginHorizontal: 4 },
  sectionText: { fontSize: 11.5, fontWeight: '600', letterSpacing: 0.9 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
