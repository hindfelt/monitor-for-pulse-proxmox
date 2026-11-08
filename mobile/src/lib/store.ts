// App-wide data store. A tiny external store (useSyncExternalStore) instead of
// React context, so each screen re-renders only for the slice it reads.
import { ExtensionStorage } from '@bacons/apple-targets';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import { activeAlerts, listResources, version, type Connection } from './api';
import { GUEST_TYPES } from './format';
import type { Alert, Resource } from './types';

const POLL_MS = 5000;
const SNAPSHOT_EVERY_MS = 60_000;
const K = { url: 'pulse.url', demo: 'pulse.demo', token: 'pulse.token', snapshot: 'pulse.snapshot' };

export interface State {
  /** undefined while reading saved settings; null when not set up yet. */
  conn: Connection | null | undefined;
  nodes: Resource[];
  guests: Resource[];
  storage: Resource[];
  alerts: Alert[];
  lastUpdate: number;
  error: string;
  loaded: boolean;
  refreshing: boolean;
  version?: string;
}

let state: State = {
  conn: undefined,
  nodes: [],
  guests: [],
  storage: [],
  alerts: [],
  lastUpdate: 0,
  error: '',
  loaded: false,
  refreshing: false,
};
const listeners = new Set<() => void>();

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => select(state),
  );
}
export const getState = () => state;

// ---- connection settings -------------------------------------------------

const WIDGET_KEY = 'pulse.widget.connection';
const WIDGET_STORE: SecureStore.SecureStoreOptions = {
  keychainService: 'pulse.widget',
  accessGroup: 'MFFD9U3PAR.com.hindfelt.pulsemobile.shared',
  // The widget refreshes while the phone is locked.
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

/** Gives the iOS widget its own copy of the connection, in a Keychain item only this app's team can read. */
async function shareWithWidget(conn: Connection | null) {
  if (Platform.OS !== 'ios') return;
  try {
    if (!conn) await SecureStore.deleteItemAsync(WIDGET_KEY, WIDGET_STORE);
    else {
      const shared = conn.demo ? { url: 'demo://sample', token: 'demo' } : { url: conn.url, token: conn.token };
      await SecureStore.setItemAsync(WIDGET_KEY, JSON.stringify(shared), WIDGET_STORE);
    }
    ExtensionStorage.reloadWidget();
  } catch {
    // Expected in Expo Go, which has no widget. The app itself doesn't depend on this.
  }
}

export async function loadSettings() {
  const [[, url], [, demo], [, snap]] = await AsyncStorage.multiGet([K.url, K.demo, K.snapshot]);
  const token = (await SecureStore.getItemAsync(K.token)) ?? '';
  const conn: Connection | null = demo === '1' ? { url: '', token: '', demo: true } : url && token ? { url, token } : null;

  // Show the last known data instantly while the first live request is in flight.
  if (conn && snap) {
    try {
      const s = JSON.parse(snap) as Pick<State, 'nodes' | 'guests' | 'storage' | 'alerts' | 'lastUpdate' | 'version'>;
      if (!!conn.demo === !!(s as { demo?: boolean }).demo) set({ ...s, loaded: true });
    } catch {}
  }
  set({ conn });
  if (conn) start();
  shareWithWidget(conn);
}

export async function saveConnection(conn: Connection) {
  stop();
  if (conn.demo) {
    await AsyncStorage.multiSet([[K.demo, '1']]);
  } else {
    await SecureStore.setItemAsync(K.token, conn.token);
    await AsyncStorage.multiSet([[K.url, conn.url], [K.demo, '0']]);
  }
  await AsyncStorage.removeItem(K.snapshot);
  set({ conn, loaded: false, nodes: [], guests: [], storage: [], alerts: [], error: '', lastUpdate: 0 });
  start();
  await shareWithWidget(conn);
}

export async function disconnect() {
  stop();
  await SecureStore.deleteItemAsync(K.token);
  await AsyncStorage.multiRemove([K.url, K.demo, K.snapshot]);
  await shareWithWidget(null);
  set({ conn: null, loaded: false, nodes: [], guests: [], storage: [], alerts: [], error: '', lastUpdate: 0, version: undefined });
}

// ---- polling ---------------------------------------------------------------

let timer: ReturnType<typeof setTimeout> | undefined;
let generation = 0;
let lastSnapshot = 0;
let appStateSub: { remove(): void } | undefined;

export async function refresh() {
  const conn = state.conn;
  if (!conn) return;
  const gen = generation;
  set({ refreshing: true });
  try {
    const [all, alerts] = await Promise.all([
      listResources(conn, ['agent', ...GUEST_TYPES, 'storage']),
      activeAlerts(conn).catch(() => [] as Alert[]),
    ]);
    if (gen !== generation) return; // connection changed meanwhile
    const next = {
      nodes: all.filter((r) => r.type === 'agent'),
      guests: all.filter((r) => GUEST_TYPES.includes(r.type)),
      storage: all.filter((r) => r.type === 'storage'),
      alerts,
      lastUpdate: Date.now(),
    };
    set({ ...next, error: '', loaded: true });
    if (!state.version) version(conn).then((v) => set({ version: v })).catch(() => {});
    if (Date.now() - lastSnapshot > SNAPSHOT_EVERY_MS) {
      lastSnapshot = Date.now();
      AsyncStorage.setItem(K.snapshot, JSON.stringify({ ...next, version: state.version, demo: !!conn.demo })).catch(() => {});
    }
  } catch (e) {
    if (gen === generation) set({ error: (e as Error).message || 'Could not load data' });
  } finally {
    if (gen === generation) set({ refreshing: false });
  }
}

function loop() {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    await refresh();
    if (AppState.currentState === 'active') loop();
  }, POLL_MS);
}

function start() {
  generation++;
  refresh().then(loop);
  appStateSub?.remove();
  appStateSub = AppState.addEventListener('change', (s) => {
    if (s === 'active') refresh().then(loop);
    else clearTimeout(timer); // no polling in the background: saves battery and data
  });
}

function stop() {
  generation++;
  clearTimeout(timer);
  appStateSub?.remove();
  appStateSub = undefined;
}
