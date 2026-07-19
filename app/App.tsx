/**
 * Phase 0 shell: proves the stack renders on Android and web, and that the
 * theme tokens drive both light and dark from the OS setting.
 *
 * Replaced by real navigation in Phase 1 (auth gate) — see docs/PHASE_STATUS.md.
 */
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ALLOWED_EMAIL_DOMAIN, type Priority } from '@sabeel/shared';
import { radius, space, type, useTheme } from './src/theme';

const PRIORITIES: Priority[] = ['none', 'low', 'medium', 'high', 'urgent'];

/** A stand-in for the real card face, here to exercise the tokens in both themes. */
function SampleCard({ title, priority, due }: { title: string; priority: Priority; due: string }) {
  const t = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: t.bg.surface, borderColor: t.border.subtle },
      ]}
    >
      <Text style={[type.body, { color: t.text.primary }]}>{title}</Text>
      <View style={styles.cardMeta}>
        <View style={[styles.dot, { backgroundColor: t.priority[priority] }]} />
        <Text style={[type.caption, { color: t.text.muted }]}>{due}</Text>
      </View>
    </View>
  );
}

export default function App() {
  const t = useTheme();
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <SafeAreaView style={[styles.fill, { backgroundColor: t.bg.canvas }]}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[type.title, { color: t.text.primary }]}>Sabeel Kanban</Text>
          <Text style={[type.label, { color: t.text.muted, marginBottom: space.lg }]}>
            Phase 0 · theme {t.name} · @{ALLOWED_EMAIL_DOMAIN}
          </Text>

          <Text style={[type.heading, { color: t.text.secondary, marginBottom: space.sm }]}>
            In Progress
          </Text>
          <SampleCard title="Fix signup flow" priority="urgent" due="Due Fri" />
          <SampleCard title="Draft newsletter" priority="medium" due="Due Mon" />

          <Text
            style={[
              type.heading,
              { color: t.text.secondary, marginTop: space.lg, marginBottom: space.sm },
            ]}
          >
            Priority scale
          </Text>
          <View style={[styles.swatches, { backgroundColor: t.bg.inset }]}>
            {PRIORITIES.map((p) => (
              <View key={p} style={styles.swatchRow}>
                <View style={[styles.dot, { backgroundColor: t.priority[p] }]} />
                <Text style={[type.caption, { color: t.text.secondary }]}>{p}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: space.lg, gap: space.xs },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.sm,
    gap: space.sm,
  },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dot: { width: 10, height: 10, borderRadius: radius.pill },
  swatches: { borderRadius: radius.md, padding: space.md, gap: space.sm },
  swatchRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
