import { NativeTabs } from 'expo-router/native-tabs';
import { useStore } from '@/lib/store';
import { useTheme } from '@/lib/theme';

export default function TabsLayout() {
  const t = useTheme();
  const openAlerts = useStore((s) => s.alerts.filter((a) => !a.acknowledged).length);
  return (
    <NativeTabs tintColor={t.accent}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf="house.fill" md="home" />
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="guests">
        <NativeTabs.Trigger.Icon sf="square.stack.3d.up.fill" md="view_agenda" />
        <NativeTabs.Trigger.Label>Guests</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="storage">
        <NativeTabs.Trigger.Icon sf="externaldrive.fill" md="storage" />
        <NativeTabs.Trigger.Label>Storage</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="alerts">
        <NativeTabs.Trigger.Icon sf="bell.fill" md="notifications" />
        <NativeTabs.Trigger.Label>Alerts</NativeTabs.Trigger.Label>
        {openAlerts > 0 ? <NativeTabs.Trigger.Badge>{String(openAlerts)}</NativeTabs.Trigger.Badge> : null}
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
