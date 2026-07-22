import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Sheet, SheetOption } from './Sheet';
import { radius, space, type, useTheme } from '../theme';

export type SelectOption = { value: string; label: string };

/**
 * Choose one of a list — NATIVE (web sibling: Select.web.tsx).
 *
 * React Native has no dropdown primitive, so this is a closed control that
 * opens the bounded, self-scrolling Sheet. The important property is shared with
 * the web `<select>`: it costs ONE line until you open it. The previous shape —
 * every option rendered as its own button, always — grew taller than the screen
 * on a board with many columns.
 */
export function Select({
  value,
  options,
  onChange,
  label,
  disabled,
  block,
}: {
  value: string;
  options: readonly SelectOption[];
  onChange: (next: string) => void;
  label: string;
  disabled?: boolean;
  /** Fill the container width instead of sizing to content (stacked layouts). */
  block?: boolean;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? 'none'}`}
        accessibilityState={{ disabled: !!disabled, expanded: open }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.field,
          block ? styles.block : null,
          {
            backgroundColor: pressed ? t.bg.surface : t.bg.inset,
            borderColor: t.border.subtle,
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      >
        <Text style={[type.body, { color: t.text.primary }]} numberOfLines={1}>
          {current?.label ?? '—'}
        </Text>
        {/* U+25BE, a text-presentation triangle. Deliberately not an emoji
            arrow: those render as colour glyphs and ignore the text colour. */}
        <Text style={[type.caption, { color: t.text.muted }]}>▾</Text>
      </Pressable>

      <Sheet visible={open} title={label} onClose={() => setOpen(false)}>
        {options.map((o) => (
          <SheetOption
            key={o.value}
            label={o.label}
            selected={o.value === value}
            onPress={() => {
              setOpen(false);
              onChange(o.value);
            }}
          />
        ))}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    minHeight: 44,
  },
  block: { alignSelf: 'stretch' },
});
