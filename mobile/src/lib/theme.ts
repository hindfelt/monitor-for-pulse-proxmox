import { useColorScheme } from 'react-native';

const dark = {
  bg: '#0b0e14', card: '#151a23', card2: '#1c2230', line: '#262d3b', fg: '#e8ecf3', muted: '#8a93a6',
  ok: '#34d399', warn: '#fbbf24', bad: '#f87171', off: '#5b6375', accent: '#818cf8', onAccent: '#0b0e14',
  hero: '#1a2040',
};
const light: typeof dark = {
  bg: '#f3f5f9', card: '#ffffff', card2: '#eceff5', line: '#e1e5ee', fg: '#121722', muted: '#677085',
  ok: '#10b981', warn: '#d97706', bad: '#dc2626', off: '#a3aab8', accent: '#4f46e5', onAccent: '#ffffff',
  hero: '#e0e7ff',
};
export type Theme = typeof dark;

export function useTheme(): Theme {
  return useColorScheme() === 'light' ? light : dark;
}

export const toneColor = (t: Theme, tone: 'ok' | 'warn' | 'bad' | 'off') => t[tone];
