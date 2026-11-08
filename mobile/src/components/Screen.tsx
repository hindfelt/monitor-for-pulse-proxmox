import { useCallback, useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { refresh } from '@/lib/store';
import { useTheme } from '@/lib/theme';

/** Scrollable page with pull-to-refresh and safe-area padding. */
export function Screen({ children, top = true }: { children: ReactNode; top?: boolean }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  // Only show the spinner for a pull the user made, not for background polling.
  const [pulling, setPulling] = useState(false);
  const onRefresh = useCallback(() => {
    setPulling(true);
    refresh().finally(() => setPulling(false));
  }, []);
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ paddingTop: top ? insets.top + 8 : 12, paddingHorizontal: 14, paddingBottom: insets.bottom + 100 }} // clear the floating tab bar
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={pulling} onRefresh={onRefresh} tintColor={t.muted} />}
    >
      {children}
    </ScrollView>
  );
}
