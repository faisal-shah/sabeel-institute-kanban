import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { renameColumn, COLUMN_NAME_MAX, type BoardColumn } from '@sabeel/shared';
import { IconAction, Row, TextField } from './ui';
import { space, type, useTheme } from '../theme';

/**
 * A column's name, renamed in place.
 *
 * Every surface that shows a column name offers the rename — board settings, the
 * phone pager, and both wide boards — so this is ONE component rather than four
 * copies of the same edit state. That matters more than it looks: the validation
 * has a trap in it (a column must be excluded from its own duplicate check, or
 * re-saving its name — or just fixing its capitalisation — is rejected), which is
 * why the rule itself lives in `renameColumn` in @sabeel/shared and is
 * unit-tested there.
 *
 * Renaming a column is a board write, so it is manager/admin only, exactly like
 * adding and removing them. Callers pass `canEdit`; a member simply sees the name.
 *
 * The write is the caller's: each surface already has its own `useAction` `run`
 * for busy/error, and reusing it keeps a failed rename reporting in the same
 * place as every other failure on that screen.
 */
export function ColumnNameEditor({
  column,
  columns,
  canEdit,
  suffix,
  center,
  bold,
  busy,
  onRename,
  onError,
  onEditingChange,
}: {
  column: BoardColumn;
  /** The whole list — needed to reject a name another column already has. */
  columns: readonly BoardColumn[];
  canEdit: boolean;
  /** Trailing metadata shown after the name, e.g. a card count. Not editable. */
  suffix?: string;
  center?: boolean;
  bold?: boolean;
  busy?: boolean;
  onRename: (columns: BoardColumn[]) => void;
  onError: (message: string) => void;
  /**
   * Lets a cramped surface make room while editing — the phone pager hides its
   * Prev/Next buttons so the field gets the whole row instead of the ~130px left
   * between them.
   */
  onEditingChange?: (editing: boolean) => void;
}) {
  const t = useTheme();
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;

  function begin() {
    setDraft(column.name);
    onEditingChange?.(true);
  }

  function close() {
    setDraft(null);
    onEditingChange?.(false);
  }

  function commit() {
    const result = renameColumn(columns, column.id, draft ?? '');
    if (!result.ok) {
      onError(result.error);
      return;
    }
    close();
    onRename(result.columns);
  }

  if (editing) {
    return (
      <Row style={styles.editRow}>
        <View style={styles.grow}>
          <TextField
            value={draft}
            onChangeText={setDraft}
            onSubmit={commit}
            autoFocus
            label={`Rename ${column.name}`}
            maxLength={COLUMN_NAME_MAX}
          />
        </View>
        <IconAction icon="check" label="Save column name" onPress={commit} disabled={busy} />
        <IconAction
          icon="close"
          label="Cancel rename"
          onPress={close}
          disabled={busy}
        />
      </Row>
    );
  }

  return (
    <Row style={[styles.nameRow, center && styles.center]}>
      {/* Truncates rather than wrapping: a long column name used to push the
          actions off the row. */}
      <Text
        numberOfLines={1}
        style={[
          type.body,
          bold && styles.bold,
          { color: t.text.secondary },
          !center && styles.shrink,
        ]}
      >
        {column.name}
        {suffix ? <Text style={{ color: t.text.muted }}>{suffix}</Text> : null}
      </Text>
      {canEdit ? (
        <IconAction
          icon="edit"
          label={`Rename column ${column.name}`}
          onPress={begin}
          disabled={busy}
        />
      ) : null}
    </Row>
  );
}

const styles = StyleSheet.create({
  nameRow: { alignItems: 'center', gap: space.xs },
  center: { justifyContent: 'center' },
  editRow: { alignItems: 'center', gap: space.xs, flex: 1 },
  grow: { flex: 1 },
  shrink: { flexShrink: 1 },
  bold: { fontWeight: '600' },
});
