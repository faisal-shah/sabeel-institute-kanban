import { useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ATTACHMENT_MAX_BYTES, formatBytes } from '@sabeel/shared';
import {
  attachmentUrl,
  removeAttachment,
  uploadAttachment,
  useAttachments,
  type Attachment,
} from '../attachments';
import { PICK_SOURCES, pickAttachment, type PickSource } from '../filePicker';
import { openAttachment } from '../openAttachment';
import { confirmAction } from '../confirm';
import { useAction } from '../useAction';
import type { SessionUser } from '../session';
import { radius, space, useTheme } from '../theme';
import {
  Body,
  Caption,
  Card as Panel,
  Heading,
  Hint,
  IconAction,
  LoadError,
  ProgressBar,
  Row,
  Spinner,
} from './ui';
import { Sheet, SheetOption } from './Sheet';

type MaterialIconName = ComponentProps<typeof MaterialIcons>['name'];

/** A glyph for the file's kind. Decoration inside a pressable row, not an action. */
function glyphFor(contentType: string): MaterialIconName {
  if (contentType === 'application/pdf') return 'picture-as-pdf';
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('video/')) return 'movie';
  if (contentType.startsWith('audio/')) return 'audiotrack';
  if (/zip|compressed|tar|rar|7z/.test(contentType)) return 'folder-zip';
  if (/sheet|excel|csv/.test(contentType)) return 'table-chart';
  if (/word|document|text\//.test(contentType)) return 'description';
  return 'insert-drive-file';
}

/** The extension, which is what people actually recognise a file by. */
function kindOf(name: string): string {
  const ext = name.includes('.') ? (name.split('.').pop() ?? '') : '';
  return ext && ext.length <= 4 ? ext.toUpperCase() : 'FILE';
}

const SOURCE_LABELS: Record<PickSource, { label: string; detail: string }> = {
  files: { label: 'Choose a file', detail: 'Documents, PDFs, anything' },
  photos: { label: 'Photo library', detail: 'Pick an existing photo' },
  camera: { label: 'Take a photo', detail: 'Use the camera now' },
};

/**
 * Files on a card.
 *
 * The upload state lives HERE, above the per-row branch, and that placement is
 * load-bearing. An upload spans the moment its record starts existing — the
 * document is created first, because creating it is what authorizes the upload
 * — so the live query flips a row from absent to present *while bytes are still
 * moving*. Anything keyed on "does the row exist" would be destroyed exactly
 * when it is needed, leaving a healthy upload rendering as a broken file for its
 * whole duration.
 *
 * For the same reason a row in `uploading` with nothing in flight is a NORMAL
 * state, not an error: a reload, or an upload that genuinely failed. It says so
 * and offers removal, rather than looking like a file that ought to open.
 */
export function Attachments({ cardId, user }: { cardId: string; user: SessionUser }) {
  const t = useTheme();
  const list = useAttachments(cardId);
  const { run, busy, error, setError } = useAction('attachments');
  const [progress, setProgress] = useState<Record<string, number | null>>({});
  const [picking, setPicking] = useState(false);

  const start = (source: PickSource) => {
    setPicking(false);
    let started: string | null = null;
    void run(async () => {
      const picked = await pickAttachment(source);
      if (!picked) return;
      // Checked here as well as in the rules, so the ordinary mistake of
      // grabbing a huge file fails with a sentence instead of a raw
      // permission-denied from Storage.
      if (picked.blob.size > ATTACHMENT_MAX_BYTES) {
        setError(`Files must be under ${formatBytes(ATTACHMENT_MAX_BYTES)}.`);
        return;
      }
      try {
        await uploadAttachment({
          cardId,
          picked,
          user,
          onStart: (id) => {
            started = id;
            setProgress((p) => ({ ...p, [id]: null }));
          },
          onProgress: (id, fraction) => setProgress((p) => ({ ...p, [id]: fraction })),
        });
      } finally {
        // Drop the local tracking either way: on success the row is `ready` and
        // renders from the document, and on failure the row is gone.
        if (started) {
          const id = started;
          setProgress((p) => {
            const next = { ...p };
            delete next[id];
            return next;
          });
        }
      }
    }, 'uploadAttachment');
  };

  const attach = () => {
    if (PICK_SOURCES.length === 1) return start(PICK_SOURCES[0]);
    setPicking(true);
  };

  const remove = (a: Attachment) => {
    void (async () => {
      const ok = await confirmAction(
        'Remove this file?',
        `${a.name} will be deleted for everyone on this board. This cannot be undone.`,
      );
      if (!ok) return;
      void run(() => removeAttachment(cardId, a.id), 'removeAttachment');
    })();
  };

  // NOT awaited before `run`: the tab has to be opened while the tap is still
  // the reason anything is happening, or the browser blocks it silently.
  const open = (a: Attachment) =>
    void run(() => openAttachment(() => attachmentUrl(cardId, a.id)), 'openAttachment');

  const items = list.data ?? [];

  return (
    <>
      <Heading
        action={
          PICK_SOURCES.length > 0 ? (
            <IconAction
              icon="attach-file"
              label="Attach a file"
              onPress={attach}
              disabled={busy}
            />
          ) : null
        }
      >
        Attachments{items.length > 0 ? ` (${items.length})` : ''}
      </Heading>

      <Panel>
        {error ? <Hint>{error}</Hint> : null}

        {list.status === 'loading' ? <Spinner label="Loading files…" /> : null}
        {list.status === 'error' ? <LoadError what="the files" code={list.error} /> : null}

        {list.status === 'ready' && items.length === 0 ? (
          <Hint>
            {PICK_SOURCES.length > 0
              ? 'No files yet.'
              : 'No files yet. Adding one needs a newer version of the app.'}
          </Hint>
        ) : null}

        {items.map((a) => {
          const tracked = a.id in progress;
          const ready = a.status === 'ready';

          if (!ready && tracked) {
            const fraction = progress[a.id];
            return (
              <View key={a.id} style={styles.uploading}>
                <Body numberOfLines={1}>{a.name}</Body>
                <ProgressBar
                  fraction={fraction}
                  label={
                    fraction === null
                      ? 'Preparing…'
                      : fraction < 1
                        ? `Uploading ${Math.round(fraction * 100)}%`
                        : 'Finishing…'
                  }
                />
              </View>
            );
          }

          return (
            <Row key={a.id} style={styles.row}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={ready ? `Open ${a.name}` : a.name}
                onPress={ready ? () => open(a) : undefined}
                disabled={!ready}
                style={({ pressed }) => [styles.face, pressed && ready && { opacity: 0.6 }]}
              >
                <MaterialIcons
                  name={ready ? glyphFor(a.contentType) : 'error-outline'}
                  size={20}
                  color={ready ? t.text.muted : t.text.danger}
                />
                <View style={styles.text}>
                  <Body numberOfLines={1}>{a.name}</Body>
                  {ready ? (
                    <Caption>
                      {kindOf(a.name)}
                      {a.sizeBytes ? ` · ${formatBytes(a.sizeBytes)}` : ''}
                    </Caption>
                  ) : (
                    <Hint>Upload didn’t finish</Hint>
                  )}
                </View>
              </Pressable>
              <IconAction
                icon="delete-outline"
                label={`Remove ${a.name}`}
                danger
                disabled={busy}
                onPress={() => remove(a)}
              />
            </Row>
          );
        })}
      </Panel>

      <Sheet visible={picking} title="Attach a file" onClose={() => setPicking(false)}>
        {PICK_SOURCES.map((s) => (
          <SheetOption
            key={s}
            label={SOURCE_LABELS[s].label}
            detail={SOURCE_LABELS[s].detail}
            onPress={() => start(s)}
          />
        ))}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  row: { justifyContent: 'space-between', gap: space.xs },
  // The row is the touch target, so it fills the space the delete icon leaves.
  face: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  text: { flex: 1 },
  uploading: { gap: space.xs, paddingVertical: space.xs, borderRadius: radius.sm },
});
