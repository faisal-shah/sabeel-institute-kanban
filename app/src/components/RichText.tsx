/**
 * Renders a stored description or comment on BOTH platforms.
 *
 * All parsing lives in `@sabeel/shared` (and is tested there, including a seeded
 * round-trip fuzz); this is a thin rendering shell over typed nodes. Nothing
 * here interprets HTML — the parser emits nodes and this maps them to RN `Text`,
 * so a description containing `<script>` renders as literal characters and there
 * is no sanitiser to get wrong.
 *
 * NOT split by platform. Only the *editor* differs between web and native; the
 * rendered result must be identical or the two surfaces disagree about what a
 * card says, which is the one thing a shared board cannot tolerate.
 */
import { Fragment } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { parseRichForDisplay, type RichInline } from '@sabeel/shared';
import { space, type, useTheme } from '../theme';

function openHref(href: string) {
  void Linking.openURL(href).catch(() => undefined);
}

function Inline({ nodes }: { nodes: RichInline[] }) {
  const t = useTheme();
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.kind) {
          case 'text':
            return <Fragment key={i}>{n.text}</Fragment>;
          case 'bold':
            return (
              <Text key={i} style={styles.bold}>
                <Inline nodes={n.content} />
              </Text>
            );
          case 'italic':
            return (
              <Text key={i} style={styles.italic}>
                <Inline nodes={n.content} />
              </Text>
            );
          case 'link':
            return (
              <Text
                key={i}
                style={[styles.link, { color: t.accent.base }]}
                accessibilityRole="link"
                onPress={() => openHref(n.href)}
              >
                <Inline nodes={n.content} />
              </Text>
            );
        }
      })}
    </>
  );
}

/** A list row: the marker sits in its own column so wrapped text stays aligned. */
function Row({ marker, nodes }: { marker: string; nodes: RichInline[] }) {
  const t = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[type.body, { color: t.text.secondary }, styles.marker]}>{marker}</Text>
      <Text style={[type.body, { color: t.text.primary }, styles.rowText]}>
        <Inline nodes={nodes} />
      </Text>
    </View>
  );
}

export function RichText({ markdown }: { markdown: string }) {
  const t = useTheme();
  const doc = parseRichForDisplay(markdown);

  return (
    <View style={styles.doc}>
      {doc.map((b, i) => {
        if (b.kind === 'paragraph') {
          return (
            // `selectable` matches what a plain `Text` already gives on web;
            // setting it explicitly means native gains it too rather than
            // quietly losing the ability to copy a description.
            <Text key={i} selectable style={[type.body, { color: t.text.primary }]}>
              <Inline nodes={b.content} />
            </Text>
          );
        }
        return (
          <View key={i} style={styles.list}>
            {b.items.map((item, j) => (
              <Row
                key={j}
                marker={b.kind === 'bullets' ? '•' : `${j + 1}.`}
                nodes={item}
              />
            ))}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  doc: { gap: space.sm },
  list: { gap: space.xs },
  row: { flexDirection: 'row', gap: space.sm },
  // A fixed column keeps "10." from shoving its text out of line with "9.".
  marker: { minWidth: 18, textAlign: 'right' },
  rowText: { flex: 1 },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  link: { textDecorationLine: 'underline' },
});
