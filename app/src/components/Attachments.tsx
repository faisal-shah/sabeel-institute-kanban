import { useRef, useState, type ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
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

  /**
   * Which file is being opened — as state so the row can say so, and as a ref so
   * the tap handler can refuse a second one.
   *
   * What shipped had NEITHER, and the open row was also the one control in this
   * panel that never consulted `busy`. So it stayed live for the whole of a slow
   * open, an ordinary second tap started a second one, and on Android that
   * duplicate reached expo-sharing — which keeps exactly ONE pending promise
   * (SharingModule.kt) and rejects anything arriving while a chooser is up. A
   * member was shown "Call to function 'ExpoSharing.shareAsync' has been
   * rejected" (Sentry, 2026-07-27).
   *
   * `busy` alone would have covered that tap. The ref covers what it structurally
   * cannot: `busy` and `opening` are state, so they only reach a handler after a
   * render, and two taps inside one frame both read "idle" and both start.
   *
   * The pair is always written through `beginOpen`/`endOpen`, so it cannot drift.
   */
  const [opening, setOpening] = useState<string | null>(null);
  const openingRef = useRef<string | null>(null);

  /** Claims the open slot, or returns false if a file is already opening. */
  const beginOpen = (id: string) => {
    if (openingRef.current !== null) return false;
    openingRef.current = id;
    setOpening(id);
    return true;
  };
  const endOpen = () => {
    openingRef.current = null;
    setOpening(null);
  };

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
  const open = (a: Attachment) => {
    if (!beginOpen(a.id)) return;
    void run(
      () =>
        openAttachment({ id: a.id, name: a.name, contentType: a.contentType }, () =>
          attachmentUrl(cardId, a.id),
        ),
      'openAttachment',
    ).finally(endOpen);
  };

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
        {/* Body, not Hint: this is a failure the reader has to act on, and
            Hint is the muted style reserved for small supporting copy. Same
            shape Comments and CardScreen use for an action error. */}
        {error ? <Body>{error}</Body> : null}

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

          // Opening is SLOW and used to be silent. Native mints a signed URL and
          // then downloads the whole file before any viewer appears, so up to
          // 10 MB of phone connection passes with the row looking untouched —
          // which is why someone tapped it again and hit the share rejection.
          // The row now says what it is doing and stops taking taps.
          const isOpening = opening === a.id;
          const openable = ready && !busy;

          return (
            <Row key={a.id} style={styles.row}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  isOpening ? `Opening ${a.name}` : ready ? `Open ${a.name}` : a.name
                }
                accessibilityState={{ disabled: !openable, busy: isOpening }}
                onPress={openable ? () => open(a) : undefined}
                disabled={!openable}
                style={({ pressed }) => [styles.face, pressed && openable && { opacity: 0.6 }]}
              >
                {isOpening ? (
                  // Same 20pt box as the glyph it replaces, so the row does not
                  // jump as it starts and stops.
                  <ActivityIndicator size="small" color={t.accent.base} style={styles.glyph} />
                ) : (
                  <MaterialIcons
                    name={ready ? glyphFor(a.contentType) : 'error-outline'}
                    size={20}
                    color={ready ? t.text.muted : t.text.danger}
                    style={styles.glyph}
                  />
                )}
                <View style={styles.text}>
                  <Body numberOfLines={1}>{a.name}</Body>
                  {isOpening ? (
                    <Hint>Opening…</Hint>
                  ) : ready ? (
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
  // Fixed box for the leading mark, so swapping the file glyph for a spinner
  // while it opens does not shift the name sideways.
  glyph: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1 },
  uploading: { gap: space.xs, paddingVertical: space.xs, borderRadius: radius.sm },
});
