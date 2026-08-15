/**
 * Naming a file before it uploads — one sheet, every surface.
 *
 * The rename has to happen HERE, before anything is written, and that is
 * structural rather than a preference. The attachment document is the upload's
 * authorization — Storage rules cannot read Firestore, so creating that
 * rules-checked document is the only place board membership can be proven — and
 * clients may never update it afterwards (`firestore.rules`, attachments:
 * `allow update, delete: if false`). So the name is chosen in the gap between
 * picking the file and `setDoc`, or it is not chosen at all.
 *
 * The EXTENSION is not editable, and that is not tidiness either: it is what the
 * row shows as the file's kind, what the browser downloads the file as, what
 * `attachmentCacheName` writes to disk on Android, and what `ACTION_VIEW` and the
 * share sheet read to pick a viewer. Editing it away would produce an unopenable
 * file that still looked fine in the list.
 *
 * The sheet also owns the size limit. It used to fire after the pick as an error
 * message, which read as something going wrong; here it is a fact about the file
 * you are looking at, stated before a single byte moves.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_NAME_MAX,
  attachmentKind,
  formatBytes,
  splitAttachmentName,
} from '@sabeel/shared';
import { Sheet } from './Sheet';
import { Button, Hint, Row, TextField } from './ui';
import { space } from '../theme';

export function AttachSheet({
  name,
  sizeBytes,
  onCancel,
  onConfirm,
}: {
  /** The picked file's name, or null when nothing is waiting to be named. */
  name: string | null;
  sizeBytes: number;
  onCancel: () => void;
  /** The full name, extension included. */
  onConfirm: (name: string) => void;
}) {
  return (
    <Sheet visible={name !== null} title="Attach a file" onClose={onCancel}>
      {/* Unmount-scoped: `Sheet` renders nothing while closed, so the field
          below mounts fresh on each open and the lifecycle IS the reseed. An
          effect putting the name back instead is what emptied the link dialog's
          fields at random — see LinkSheet. */}
      <AttachFields name={name ?? ''} sizeBytes={sizeBytes} onConfirm={onConfirm} />
    </Sheet>
  );
}

function AttachFields({
  name,
  sizeBytes,
  onConfirm,
}: {
  name: string;
  sizeBytes: number;
  onConfirm: (name: string) => void;
}) {
  const { base, ext } = splitAttachmentName(name);
  const [draft, setDraft] = useState(base);

  const tooBig = sizeBytes > ATTACHMENT_MAX_BYTES;
  const ok = draft.trim().length > 0 && !tooBig;
  const confirm = () => {
    if (ok) onConfirm(`${draft.trim()}${ext}`);
  };

  return (
    <>
      {/* A LABEL, not just a placeholder: the placeholder disappears the moment
          there is anything in the field, and this field arrives pre-filled. */}
      <Hint>Name</Hint>
      <Row style={styles.field}>
        <View style={styles.grow}>
          <TextField
            value={draft}
            onChangeText={setDraft}
            placeholder="File name"
            label="File name"
            // The cap is on the WHOLE name, which is what the rules bound, so
            // the fixed suffix comes out of the allowance rather than being
            // silently truncated off the end by the server.
            maxLength={ATTACHMENT_NAME_MAX - ext.length}
            autoFocus
            onSubmit={confirm}
          />
        </View>
        {/* Shown, never editable — the one part of the name that is load-bearing. */}
        {ext ? <Hint>{ext}</Hint> : null}
      </Row>

      <Hint>
        {attachmentKind(name)} · {formatBytes(sizeBytes)}
      </Hint>

      {tooBig ? (
        <Hint>
          Files must be under {formatBytes(ATTACHMENT_MAX_BYTES)}. Choose a smaller
          one.
        </Hint>
      ) : null}
      {draft.trim().length === 0 ? <Hint>A file needs a name.</Hint> : null}

      <Row>
        <Button label="Upload" disabled={!ok} onPress={confirm} />
      </Row>
    </>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.xs },
  grow: { flex: 1 },
});
