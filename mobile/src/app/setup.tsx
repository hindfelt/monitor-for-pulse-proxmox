import { useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import { normalizeUrl, testConnection } from '@/lib/api';
import { saveConnection } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import { HTTPS_REQUIRED, isHttps } from '@/lib/url';

function Logo() {
  return (
    <Svg width={64} height={64} viewBox="0 0 64 64" accessibilityElementsHidden>
      <Rect width={64} height={64} rx={14} fill="#4f46e5" />
      <Path d="M10 34h11l5-12 8 22 6-14 3 4h11" fill="none" stroke="#fff" strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: t.card, borderColor: t.line, borderWidth: 0.5, borderRadius: 18, padding: 16, marginTop: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: t.onAccent, fontSize: 13, fontWeight: '700' }}>{n}</Text>
        </View>
        <Text style={{ color: t.fg, fontSize: 16, fontWeight: '700' }}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

export default function Setup() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const connect = async () => {
    const conn = { url: normalizeUrl(url), token: token.trim() };
    if (!conn.url || !conn.token) return setError('Enter both the address and the API token.');
    if (!isHttps(conn.url)) return setError(HTTPS_REQUIRED);
    setBusy(true);
    setError('');
    try {
      await testConnection(conn);
      await saveConnection(conn);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const input = { backgroundColor: t.card2, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, color: t.fg, fontSize: 16 } as const;
  const hint = { color: t.muted, fontSize: 12.5, marginTop: 8, lineHeight: 18 } as const;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 32, paddingHorizontal: 20, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', marginBottom: 12 }}>
          <Logo />
          <Text style={{ color: t.fg, fontSize: 28, fontWeight: '800', letterSpacing: -0.5, marginTop: 14, textAlign: 'center' }}>Monitor for Pulse</Text>
          <Text style={{ color: t.muted, marginTop: 6, lineHeight: 20, textAlign: 'center' }}>
            Your Proxmox homelab at a glance. Read-only, and connected only to your own Pulse server.
          </Text>
        </View>

        <Step n={1} title="Your Pulse address">
          <TextInput
            style={input} value={url} onChangeText={setUrl} placeholder="https://pulse.example.com"
            placeholderTextColor={t.muted} autoCapitalize="none" autoCorrect={false} keyboardType="url"
            textContentType="URL" returnKeyType="next" accessibilityLabel="Pulse address"
          />
          <Text style={hint}>It has to use HTTPS with a valid certificate. Away from home, you may need your VPN on.</Text>
        </Step>

        <Step n={2} title="A read-only API token">
          <TextInput
            style={input} value={token} onChangeText={setToken} placeholder="Paste token"
            placeholderTextColor={t.muted} autoCapitalize="none" autoCorrect={false} secureTextEntry
            textContentType="password" returnKeyType="go" onSubmitEditing={connect} accessibilityLabel="API token"
          />
          <Text style={hint}>
            {'In Pulse, go to Settings → API Access and create a token with only "Monitoring & alerts (read)". It stays in this phone\'s secure storage.'}
          </Text>
        </Step>

        {error ? <Text style={{ color: t.bad, marginTop: 16, marginHorizontal: 4, lineHeight: 20 }} accessibilityRole="alert">{error}</Text> : null}

        <Pressable
          onPress={connect} disabled={busy} accessibilityRole="button"
          style={({ pressed }) => ({ marginTop: 20, backgroundColor: t.accent, opacity: pressed || busy ? 0.8 : 1, borderRadius: 14, paddingVertical: 16, alignItems: 'center' })}
        >
          {busy ? <ActivityIndicator color={t.onAccent} /> : <Text style={{ color: t.onAccent, fontWeight: '700', fontSize: 16 }}>Connect</Text>}
        </Pressable>

        <Pressable onPress={() => saveConnection({ url: '', token: '', demo: true })} accessibilityRole="button" style={{ marginTop: 8, paddingVertical: 14, alignItems: 'center' }}>
          <Text style={{ color: t.accent, fontWeight: '600' }}>Try it with demo data</Text>
        </Pressable>

        <Text style={{ color: t.muted, fontSize: 11.5, textAlign: 'center', marginTop: 8 }}>Not affiliated with the Pulse project.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
