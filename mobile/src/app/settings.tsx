import Constants from 'expo-constants';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/ui';
import { disconnect, useStore } from '@/lib/store';
import { useTheme } from '@/lib/theme';

function Row({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 11, borderBottomWidth: 0.5, borderBottomColor: t.line, gap: 12 }}>
      <Text style={{ color: t.muted }}>{label}</Text>
      <Text style={{ color: t.fg, fontWeight: '600', flexShrink: 1, textAlign: 'right' }} numberOfLines={1}>{value}</Text>
    </View>
  );
}

export default function Settings() {
  const t = useTheme();
  const conn = useStore((s) => s.conn);
  const version = useStore((s) => s.version);

  const confirmDisconnect = () =>
    Alert.alert('Disconnect from Pulse?', 'The saved address and token will be removed from this phone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disconnect', style: 'destructive', onPress: () => disconnect() },
    ]);

  return (
    <Screen top={false}>
      <Card style={{ paddingVertical: 2 }}>
        <Row label="Server" value={conn?.demo ? 'Demo data' : conn?.url ?? '—'} />
        <Row label="Pulse version" value={version ?? '—'} />
        <Row label="App version" value={Constants.expoConfig?.version ?? '—'} />
      </Card>
      <Pressable onPress={confirmDisconnect} accessibilityRole="button" style={{ marginTop: 16, backgroundColor: t.card, borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 0.5, borderColor: t.line }}>
        <Text style={{ color: t.bad, fontWeight: '600' }}>{conn?.demo ? 'Leave demo and connect' : 'Disconnect'}</Text>
      </Pressable>
      <Text style={{ color: t.muted, fontSize: 12, textAlign: 'center', marginTop: 20, lineHeight: 18 }}>
        Read-only companion for{' '}
        <Text style={{ color: t.accent }} onPress={() => Linking.openURL('https://github.com/rcourtman/Pulse')}>Pulse</Text>.
        {'\n'}Not affiliated with the Pulse project.
      </Text>
    </Screen>
  );
}
