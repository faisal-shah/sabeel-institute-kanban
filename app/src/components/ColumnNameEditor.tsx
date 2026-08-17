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
 * Renaming a column is a board write, so it is board-owner/admin only, exactly like
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
  lines = 1,
  bold,
  busy,
  onRename,
  run,
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
  /**
   * How many lines the name may occupy before it truncates. One everywhere it
   * shares a row with other content; two on the phone pager, where the name is
   * the row and there is empty space above and below it.
   */
  lines?: number;
  bold?: boolean;
  busy?: boolean;
  /**
   * The write itself, and it must REJECT if the write fails — that rejection is
   * what keeps the field open. Do not wrap it in the caller's `run`; pass `run`
   * separately, or a failure resolves quietly and the draft is discarded.
   */
  onRename: (columns: BoardColumn[]) => Promise<unknown>;
  /** The caller's `useAction` runner, so a failed rename reports in the same
   *  banner as every other failure on that screen. */
  run: (fn: () => Promise<unknown>) => void;
  onError: (message: string) => void;
  /**
   * Lets a cramped surface make room while editing — the phone pager hides its
   * Prev/Next arrows so the field gets the whole row instead of the ~190px left
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

  // CLOSES ONLY ONCE THE WRITE LANDS.
  //
  // It used to close first and hand the write up afterwards, so a rename that
  // failed on the network took your text with it and left an error banner
  // pointing at a name you could no longer see. `run` reports the failure and
  // the throw never reaches `close()`, so the field stays open with the draft
  // intact — the same commit timing `saveLabelName` in board settings has
  // always had. One rule for both, rather than a note explaining why two
  // editors one screen apart behave differently.
  function commit() {
    const result = renameColumn(columns, column.id, draft ?? '');
    if (!result.ok) {
      onError(result.error);
      return;
    }
    run(async () => {
      await onRename(result.columns);
      close();
    });
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
        {/* Save is the affirmative and is tinted; cancel stays quiet. Two muted
            18px glyphs side by side were reported as indistinguishable on a real
            phone — shape alone is not enough to tell them apart in a hurry. */}
        <IconAction
          icon="check"
          label="Save column name"
          onPress={commit}
          accent
          disabled={busy}
        />
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
      {/*
        THE BALANCE SPACER — what actually centres the NAME.
        Without it the row is `text + gap + 44px icon` and the parent centres
        that whole unit, so the text lands ~24px LEFT of true centre. Mirroring
        the icon on the left makes the two sides symmetric, so the name itself
        sits on the centre line.

        It collapses rather than truncating the name: its shrink weight
        (999 x 44) dwarfs the text's, so Yoga takes the space out of the spacer
        first. A long name therefore slides the name+pencil pair LEFT into the
        room that exists there, and only starts truncating once the spacer is
        gone.
      */}
      {center && canEdit ? <View style={styles.balance} /> : null}
      {/* `shrink` is not optional. Without it Yoga measures the name against the
          whole label cell and then lays it out NEXT TO the edit icon, so the row
          is wider than its parent. A View clips on web but not on Android, where
          a long name was filmed painting straight over the pager's Prev
          arrow. It shrinks, then truncates at `lines`. */}
      <Text
        numberOfLines={lines}
        style={[
          type.body,
          bold && styles.bold,
          { color: t.text.secondary },
          styles.shrink,
          center && styles.centerText,
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
  /*
   * `flexShrink: 1` is not optional either. react-native-web's View base style
   * sets flex-shrink to 0, so this row sizes to its content and OVERFLOWS its
   * parent rather than letting the name truncate — which pushed the rename
   * pencil 15px past the right edge of a 320px screen in Board settings, for a
   * column whose name was merely long. The Text's own `shrink` cannot help
   * while the row around it refuses to give.
   */
  nameRow: { alignItems: 'center', gap: space.xs, flexShrink: 1, minWidth: 0 },
  /**
   * `alignSelf`, NOT `flex: 1`. The phone pager's label cell is a COLUMN flex
   * container, so `flex: 1` here would stretch this row vertically and leave it
   * still sized to its content horizontally — the centring would not change.
   * Stretching on the cross axis is what gives the row the full width, which is
   * what `justifyContent` and the balance spacer then work against.
   */
  center: { justifyContent: 'center', alignSelf: 'stretch' },
  /** Mirrors IconAction's 44x44 box; see the spacer comment above. */
  balance: { width: 44, flexShrink: 999 },
  // Centred so a name that wraps reads as one centred block, not a centred
  // first line with a ragged second.
  centerText: { textAlign: 'center' },
  editRow: { alignItems: 'center', gap: space.xs, flex: 1 },
  grow: { flex: 1 },
  shrink: { flexShrink: 1 },
  bold: { fontWeight: '600' },
});
