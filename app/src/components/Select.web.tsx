import { getTheme, radius, space } from '../theme';

export type SelectOption = { value: string; label: string };

/**
 * Choose one of a list — WEB (native sibling: Select.tsx).
 *
 * A real `<select>`. It replaced a column of one button per option, which was
 * the wrong shape for this job: with a dozen columns the list was taller than
 * the screen, so the dialog spent all its vertical space restating choices the
 * reader had not asked to see yet. A dropdown costs one line until opened, then
 * scrolls itself.
 *
 * Using the browser's own control also brings keyboard navigation, type-ahead,
 * and the platform's scrolling behaviour for free — all of which a hand-rolled
 * popup would have to reimplement and would get subtly wrong.
 */
export function Select({
  value,
  options,
  onChange,
  label,
  disabled,
}: {
  value: string;
  options: readonly SelectOption[];
  onChange: (next: string) => void;
  label: string;
  disabled?: boolean;
}) {
  const t = getTheme();

  return (
    <select
      value={value}
      aria-label={label}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      style={{
        background: t.bg.inset,
        color: t.text.primary,
        border: `1px solid ${t.border.subtle}`,
        borderRadius: radius.sm,
        padding: space.md,
        minHeight: 44,
        fontSize: 15,
        // Size to the CURRENT selection, not the widest option — a native
        // <select> otherwise reserves room for its longest option, so a short
        // board sat in a box wide enough for the longest one. Capped at the
        // container width; unsupported browsers fall back to the old sizing.
        fieldSizing: 'content',
        maxWidth: '100%',
        opacity: disabled ? 0.5 : 1,
        // The app is light-only; pin the native control so the browser does
        // not tint the dropdown arrow to a dark scheme.
        colorScheme: 'light',
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
