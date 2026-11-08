import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { loadSettings, useStore } from '@/lib/store';
import { useTheme } from '@/lib/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const t = useTheme();
  const conn = useStore((s) => s.conn);

  useEffect(() => {
    loadSettings().finally(() => SplashScreen.hideAsync().catch(() => {}));
  }, []);

  if (conn === undefined) return null; // still reading saved settings (splash is showing)

  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: t.bg },
          headerStyle: { backgroundColor: t.bg },
          headerTintColor: t.accent,
          headerTitleStyle: { color: t.fg },
          headerShadowVisible: false,
        }}
      >
        <Stack.Protected guard={!!conn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="guest/[id]" options={{ headerShown: true, title: '', headerBackTitle: 'Back' }} />
          <Stack.Screen name="settings" options={{ presentation: 'modal', headerShown: true, title: 'Settings' }} />
        </Stack.Protected>
        <Stack.Protected guard={!conn}>
          <Stack.Screen name="setup" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
