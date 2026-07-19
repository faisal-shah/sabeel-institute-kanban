/**
 * Renders card-description markdown on both platforms.
 *
 * All parsing lives in `@sabeel/shared` (and is tested there); this is a thin
 * rendering shell over it. Nothing here interprets HTML — the parser emits typed
 * nodes and this maps them to RN Text, so a description containing `<script>`
 * renders as literal characters and there is no sanitiser to get wrong.
 */
import { Fragment } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { parseMarkdown, type InlineNode } from '@sabeel/shared';
import { space, type, useTheme } from '../theme';

function InlineRun({ nodes }: { nodes: InlineNode[] }) {
  const t = useTheme();
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.kind) {
          case 'bold':
            return (
              <Text key={i} style={styles.bold}>
                {n.text}
              </Text>
            );
          case 'italic':
            return (
              <Text key={i} style={styles.italic}>
                {n.text}
              </Text>
            );
          case 'code':
            return (
              <Text key={i} style={[styles.code, { backgroundColor: t.bg.inset }]}>
                {n.text}
              </Text>
            );
          case 'link':
            return (
              <Text
                key={i}
                style={[styles.link, { color: t.text.accent }]}
                accessibilityRole="link"
                onPress={() => void Linking.openURL(n.href)}
              >
                {n.text}
              </Text>
            );
          default:
            return <Fragment key={i}>{n.text}</Fragment>;
        }
      })}
    </>
  );
}

export function Markdown({ source }: { source: string }) {
  const t = useTheme();
  const blocks = parseMarkdown(source);

  return (
    <View style={styles.block}>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'heading':
            return (
              <Text
                key={i}
                style={[
                  b.level === 1 ? type.title : b.level === 2 ? type.heading : type.label,
                  { color: t.text.primary, marginTop: space.sm },
                ]}
              >
                <InlineRun nodes={b.content} />
              </Text>
            );
          case 'bullet':
            return (
              <View key={i} style={styles.listRow}>
                <Text style={[type.body, { color: t.text.muted }]}>{'•'}</Text>
                <Text style={[type.body, styles.grow, { color: t.text.secondary }]}>
                  <InlineRun nodes={b.content} />
                </Text>
              </View>
            );
          case 'numbered':
            return (
              <View key={i} style={styles.listRow}>
                <Text style={[type.body, { color: t.text.muted }]}>{b.marker}.</Text>
                <Text style={[type.body, styles.grow, { color: t.text.secondary }]}>
                  <InlineRun nodes={b.content} />
                </Text>
              </View>
            );
          case 'blank':
            return <View key={i} style={styles.gap} />;
          default:
            return (
              <Text key={i} style={[type.body, { color: t.text.secondary }]}>
                <InlineRun nodes={b.content} />
              </Text>
            );
        }
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.xs },
  grow: { flex: 1 },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  code: { fontFamily: 'monospace', paddingHorizontal: 4, borderRadius: 4 },
  link: { textDecorationLine: 'underline' },
  listRow: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  gap: { height: space.sm },
});
