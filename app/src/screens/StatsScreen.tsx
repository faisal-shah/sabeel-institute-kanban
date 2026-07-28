import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import {
  STATS_ALL_SCOPE,
  STATS_METRICS,
  addDays,
  aggregate,
  formatBytes,
  startOfMonth,
  startOfWeek,
  todayInOrgTz,
  toDailySeries,
  type StatsBucketing,
  type StatsMetric,
  type StatsPoint,
} from '@sabeel/shared';
import { useMyBoards, useArchivedBoards } from '../boards';
import { STATS_MONTHS_BACK, useStatsMonths, useStoredTotals } from '../stats';
import type { SessionUser } from '../session';
import { Sheet, SheetOption } from '../components/Sheet';
import {
  Body,
  Caption,
  Card as Panel,
  FilterChip,
  Heading,
  Hint,
  LoadError,
  Row,
  Screen,
  SegmentedIcons,
  Spinner,
  Title,
} from '../components/ui';
import { radius, space, type as type_, useTheme } from '../theme';

/**
 * How many buckets each view SHOWS, independent of how much is loaded.
 *
 * Twelve months of daily bars is 365 columns — about four metres of scrolling at
 * a legible width, and 365 views to lay out. Nobody scrolls back a year one day
 * at a time; they switch to Monthly. So each bucketing shows the span it is
 * actually useful over, and the subscription still covers the full year so
 * switching between them stays instant and reads nothing.
 */
const WINDOW: Record<StatsBucketing, number> = { day: 60, week: 26, month: 12 };

/**
 * The period control. Material's own calendar-view glyphs, which say "grouped by
 * day / week / month" more directly than any three words would, and each keeps
 * its word on `accessibilityLabel`.
 */
const BUCKETINGS = [
  { key: 'day' as const, icon: 'calendar-view-day' as const, label: 'Daily' },
  { key: 'week' as const, icon: 'calendar-view-week' as const, label: 'Weekly' },
  { key: 'month' as const, icon: 'calendar-view-month' as const, label: 'Monthly' },
];

/**
 * How the boards are actually being used.
 *
 * Manager-and-above, because a member has no use for it and the board filter
 * would otherwise have to be narrowed to their own boards — see firestore.rules.
 *
 * Everything is derived from ONE subscription to a range of month documents.
 * Switching metric or bucketing re-derives in memory and reads nothing, which is
 * why the controls are instant and never flash a spinner.
 */
export function StatsScreen({ user }: { user: SessionUser }) {
  const today = todayInOrgTz();
  const from = startOfMonth(addDays(today, -30 * (STATS_MONTHS_BACK - 1)));

  const [scope, setScope] = useState<string>(STATS_ALL_SCOPE);
  const [bucketing, setBucketing] = useState<StatsBucketing>('day');
  const [metric, setMetric] = useState<StatsMetric>('cardsCreated');
  const [pickerOpen, setPickerOpen] = useState(false);

  const active = useMyBoards(user);
  const archived = useArchivedBoards(user);
  const months = useStatsMonths(scope, from, today);
  const totals = useStoredTotals();

  /**
   * Every board, archived ones included and marked.
   *
   * Archiving a board does not retract the work that happened on it, so hiding
   * it here would drop months of history out of the picker while leaving it in
   * the all-boards totals — and the two would never add up.
   */
  const boards = useMemo(
    () => [
      ...(active.data ?? []).map((b) => ({ id: b.id, name: b.name, archived: false })),
      ...(archived.data ?? []).map((b) => ({ id: b.id, name: b.name, archived: true })),
    ],
    [active.data, archived.data],
  );

  const points = useMemo(() => {
    if (!months.data) return [];
    const all = aggregate(toDailySeries(months.data, from, today), bucketing, metric);
    return all.slice(-WINDOW[bucketing]);
  }, [months.data, from, today, bucketing, metric]);

  if (months.status === 'error') {
    return (
      <Screen>
        <Title>Stats</Title>
        <LoadError what="stats" code={months.error} />
      </Screen>
    );
  }

  const scopeName =
    scope === STATS_ALL_SCOPE
      ? 'All boards'
      : (boards.find((b) => b.id === scope)?.name ?? 'That board');

  return (
    <Screen>
      <Title>Stats</Title>

      <Row style={styles.pickerRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Board filter, currently ${scopeName}`}
          onPress={() => setPickerOpen(true)}
          style={({ pressed }) => [styles.picker, pressed ? { opacity: 0.7 } : null]}
        >
          <Body>{scopeName}</Body>
          <Hint>Change</Hint>
        </Pressable>
      </Row>

      {/*
        TWO SEPARATE QUESTIONS — which period, and which measure — so they have
        to look like two controls.

        They did not. `Screen` gives every child `gap: space.sm` (8), and the
        wrapped metric chips used `space.xs` (4) between their own rows: 8
        between the groups against 4 within one is not a difference anyone can
        see, so all six chips read as a single wrapped set, with a filled
        raspberry chip in each looking like two selections in one group.

        The fix is a spacing HIERARCHY, not more space: `space.sm` inside a
        group, `space.lg` between them — a clean 2× step. Grouping them under
        one parent is what makes that expressible at all; as three siblings of
        `Screen` every gap was necessarily the same.
      */}
      <View style={styles.controls}>
        {/* Period is a pick-ONE, so it is a segmented control, not chips. Chips
            each turn on and off, which says "combine any of these" — and next to
            the metric chips the two groups read as one wrapped set with two
            selections lit. A different SHAPE separates them far more reliably
            than any amount of space could. */}
        <SegmentedIcons
          options={BUCKETINGS}
          value={bucketing}
          onChange={setBucketing}
        />

        {/* One metric at a time. Six small charts stacked would each get about
            forty points of height on a phone, and six horizontal scrollers on
            one page fight the vertical scroll. */}
        <View style={styles.chipGroup}>
          {STATS_METRICS.map((m) => (
            <FilterChip
              key={m.key}
              label={m.label}
              active={metric === m.key}
              onPress={() => setMetric(m.key)}
            />
          ))}
        </View>
      </View>

      {months.status === 'loading' ? (
        <Spinner label="Loading stats…" />
      ) : (
        <Chart points={points} metric={metric} bucketing={bucketing} today={today} />
      )}

      <Panel>
        <Heading>Files stored</Heading>
        {totals.status === 'error' ? (
          <Caption>Not available</Caption>
        ) : (
          <Body>
            {formatBytes(totals.data?.bytesStored ?? 0)} across{' '}
            {totals.data?.filesStored ?? 0} file
            {(totals.data?.filesStored ?? 0) === 1 ? '' : 's'}
          </Body>
        )}
        {/* Storage is billed to the organisation, not to a board, and the
            counters keep no per-board breakdown — so say so, rather than let
            this look like it responds to the filter above. */}
        <Hint>Across all boards, whichever board is selected above.</Hint>
      </Panel>

      <Sheet visible={pickerOpen} title="Show stats for" onClose={() => setPickerOpen(false)}>
        <SheetOption
          label="All boards"
          selected={scope === STATS_ALL_SCOPE}
          onPress={() => {
            setScope(STATS_ALL_SCOPE);
            setPickerOpen(false);
          }}
        />
        {boards.map((b) => (
          <SheetOption
            key={b.id}
            label={b.name}
            detail={b.archived ? 'Archived' : undefined}
            selected={scope === b.id}
            onPress={() => {
              setScope(b.id);
              setPickerOpen(false);
            }}
          />
        ))}
      </Sheet>
    </Screen>
  );
}

// ---- The chart -------------------------------------------------------------

const PLOT_H = 168;
/**
 * The floor on bar width. Below about this the bar stops being a tappable
 * target and starts being a tally mark — so bars never shrink past it, and the
 * chart scrolls instead.
 */
const MIN_BAR_W = 20;
/** And a ceiling, so four monthly bars do not become four slabs. */
const MAX_BAR_W = 44;
const BAR_GAP = 6;
/**
 * How far apart bars may drift when there are few of them.
 *
 * With eleven monthly bars on a wide monitor the chart used to stop two thirds
 * of the way across while the value gridlines ran the full width — which reads
 * as a chart that failed to finish drawing. The slack goes into the gaps
 * instead, up to this much; past it the bars would be islands.
 */
const MAX_GAP = 28;

/**
 * How many bars should be ON SCREEN at once, per view.
 *
 * Width alone is the wrong thing to derive this from: on a wide monitor sixty
 * daily bars would technically fit, at a size that makes a fortnight
 * indistinguishable from a quarter. These are the spans that read as a unit —
 * a fortnight, two months, half a year — and anything beyond them scrolls.
 */
const VISIBLE: Record<StatsBucketing, number> = { day: 12, week: 8, month: 6 };
/** Left gutter for the value axis. Fixed, so bars never sit under its labels. */
const AXIS_W = 34;
/**
 * The width an axis label actually needs — "28 Jul" at 10pt, plus breathing room.
 *
 * Measured rather than guessed: at 30 every label rendered as "2…" because the
 * text is wider than the bar it sits under. Two things follow from that, and
 * both are needed. The stride below keeps labelled bars at least this far
 * apart, AND the label is allowed to overflow its column (see the axis label
 * style) — without the second, a 20px bar clips its own label however few are
 * shown.
 */
const LABEL_W = 44;

/**
 * A hand-rolled bar chart.
 *
 * No charting library: there is none in this stack, they all want SVG or Canvas,
 * and this needs rectangles of proportional height. Same reasoning as the
 * hand-rolled column drag handle.
 *
 * The three things that make it readable rather than merely correct:
 *
 *  - **Bars size themselves to the container.** Twelve monthly bars spread to
 *    fill the width; sixty daily bars shrink to a minimum and scroll. Neither
 *    case leaves a stripe of bars down one side of an empty panel.
 *  - **Axis labels are thinned to fit.** Every label under every bar overlaps
 *    into mush the moment bars are narrower than the text; a stride computed
 *    from the real bar width keeps them apart at any size.
 *  - **Tapping a bar reads it out.** Which is also what lets the per-bar value
 *    labels disappear when bars get thin — the number is still reachable, it is
 *    just not shouted sixty times at once.
 */
function Chart({
  points,
  metric,
  bucketing,
  today,
}: {
  points: StatsPoint[];
  metric: StatsMetric;
  bucketing: StatsBucketing;
  today: string;
}) {
  const t = useTheme();
  const scroller = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const [scrollX, setScrollX] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const spec = STATS_METRICS.find((m) => m.key === metric)!;

  const total = points.reduce((s, p) => s + p.value, 0);
  const peak = Math.max(...points.map((p) => p.value), 0);
  const max = niceMax(peak);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  if (points.length === 0 || total === 0) {
    return (
      <Panel>
        <Heading>{spec.label}</Heading>
        <Body>Nothing recorded in this period</Body>
        <Hint>
          Try a wider view, another board, or a different measure.
        </Hint>
      </Panel>
    );
  }

  const avail = Math.max(0, width - AXIS_W);
  // Size bars to however many should be visible at once — which is the whole
  // set when it is small enough to fit, and `VISIBLE` otherwise. So few bars
  // spread to fill the panel, and many bars stay legible and scroll rather than
  // shrinking to threads.
  const onScreen = Math.min(points.length, VISIBLE[bucketing]);
  const fitted = avail > 0 ? avail / onScreen - BAR_GAP : MIN_BAR_W;
  const barW = Math.round(Math.min(MAX_BAR_W, Math.max(MIN_BAR_W, fitted)));
  // A pixel of slack: rounding the width up must not put a scrollbar under a
  // chart that already fits exactly.
  const scrolls = avail > 0 && (barW + BAR_GAP) * points.length - BAR_GAP > avail + 1;
  // When everything fits, spread the leftover width between the bars so the
  // plot ends where the gridlines do.
  const gap =
    !scrolls && points.length > 1
      ? Math.max(
          BAR_GAP,
          Math.min(MAX_GAP, (avail - points.length * barW) / (points.length - 1)),
        )
      : BAR_GAP;
  const pitch = barW + gap;

  const pad = scrolls ? LABEL_W / 2 : 0;

  /**
   * Is a label of `w` on bar `i` WHOLLY inside the scroll window?
   *
   * A label can be wider than its bar, so at the edge of a scrolled chart one
   * is always half cut off — and a half-cut date is not a missing label, it is
   * a DIFFERENT one: "13 Jul" sliced by the edge reads as "3 Jul". A label that
   * cannot be shown completely is not shown at all.
   */
  const fullyVisible = (i: number, w: number) => {
    if (!scrolls) return true;
    const left = pad + i * pitch + barW / 2 - w / 2;
    return left >= scrollX - 0.5 && left + w <= scrollX + avail + 0.5;
  };

  const axis = buildAxis(points, bucketing, pitch, fullyVisible);
  // Numbers above the bars only while they fit. Below this they collide with
  // their neighbours, and the readout above is where the figure comes from.
  const showValues = barW >= 24 && String(max).length <= 3;

  const chosen = points.find((p) => p.start === selected) ?? null;

  const grid = calendarGrid(points, bucketing);

  const plot = (
    <View
      style={[
        styles.plot,
        { gap },
        scrolls
          // Half a label of room at each end, so the first and last ticks can
          // be centred on their bars and still be shown in full.
          ? { paddingHorizontal: pad }
          : { width: avail },
      ]}
    >
      {/* Vertical rules on calendar boundaries, the same idea as the value
          gridlines and with the same hierarchy: a faint one where a week turns
          over, a firm one where a month or a year does. They sit in the SCROLLING
          content, so they travel with the bars they divide rather than floating
          over them. */}
      <View pointerEvents="none" style={styles.vgrid}>
        {[...grid.minor].map((i) => (
          <View
            key={`n${i}`}
            style={[
              styles.vline,
              { left: pad + i * pitch - BAR_GAP / 2, backgroundColor: t.border.subtle },
            ]}
          />
        ))}
        {[...grid.major].map((i) => (
          <View
            key={`m${i}`}
            style={[
              styles.vline,
              styles.vlineMajor,
              { left: pad + i * pitch - BAR_GAP / 2, backgroundColor: t.border.strong },
            ]}
          />
        ))}
      </View>

      {points.map((p, i) => {
        // A bucket that has not finished is LOWER only because it is not over.
        // Drawn solid it reads as a real decline, so it is outlined instead.
        const inProgress = p.end >= today && p.start <= today;
        const isSel = p.start === selected;
        // A non-zero value always gets at least a sliver: one card in a month
        // of forty rounds to less than a pixel, and a bar that is not there
        // reads as "none", which is a different fact.
        const raw = max === 0 ? 0 : (p.value / max) * PLOT_H;
        const h = p.value > 0 ? Math.max(3, Math.round(raw)) : inProgress ? 6 : 0;
        const labelText = axis.get(i) ?? '';
        const labelled = labelText !== '';

        return (
          <Pressable
            key={p.start}
            accessibilityRole="button"
            accessibilityState={{ selected: isSel }}
            accessibilityLabel={`${p.value} ${spec.noun}, ${describeBucket(p, bucketing)}${
              inProgress ? ', still in progress' : ''
            }`}
            onPress={() => setSelected(isSel ? null : p.start)}
            // The whole column is the target, not just the bar — a zero day is
            // still worth being able to tap, and a 2px bar is not a target.
            style={[styles.column, { width: barW }]}
          >
            <View style={styles.barSlot}>
              {showValues ? (
                <Text
                  style={[type_.caption, styles.value, { color: t.text.secondary }]}
                  numberOfLines={1}
                >
                  {p.value === 0 ? '' : p.value}
                </Text>
              ) : null}
              <View
                testID="stats-bar"
                style={[
                  styles.bar,
                  { height: h, width: barW },
                  inProgress
                    ? { backgroundColor: t.bg.surface, borderWidth: 2, borderColor: t.chart.bar }
                    : { backgroundColor: isSel ? t.accent.base : t.chart.bar },
                ]}
              />
            </View>
            {/* A tick, because a label floating under a row of bars belongs to
                whichever one the eye guesses. Two pixels of line removes the
                guess. */}
            <View
              style={[
                styles.tick,
                { backgroundColor: labelled ? t.border.strong : 'transparent' },
              ]}
            />
            {/* The width lives on this VIEW, not on the Text.
                react-native-web renders Text inline, so a `width` on it is
                ignored and the label is sized by its column instead — measured:
                "20 Jul" needed 27px and was given the bar's 20. A View is
                always a block, so the box is honoured, and the label spills
                equally either side of its bar onto neighbours that the tick
                spacing has already guaranteed are blank. */}
            <View
              style={[styles.labelSlot, { marginHorizontal: (barW - LABEL_W) / 2 }]}
              pointerEvents="none"
            >
              <Text
                testID="stats-axis"
                style={[
                  type_.caption,
                  styles.axisLabel,
                  { color: isSel ? t.accent.base : t.text.secondary },
                ]}
                numberOfLines={1}
              >
                {labelText}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <Panel>
      <Row>
        <Heading>{spec.label}</Heading>
      </Row>

      {/* Fixed-height readout, so selecting a bar does not shunt the chart up
          and down the page under the finger that just tapped it. */}
      <View style={styles.readout}>
        {chosen ? (
          <Body>
            {chosen.value} {spec.noun} · {describeBucket(chosen, bucketing)}
          </Body>
        ) : (
          <Hint>
            {total} in this period · tap a bar for its exact figure
            {scrolls ? ' · swipe for more' : ''}
          </Hint>
        )}
      </View>

      <View style={styles.chartRow} onLayout={onLayout}>
        {/* Value axis. Three references are enough to read a bar against and
            few enough not to fence the data in. */}
        <View style={styles.axis}>
          {[max, Math.round(max / 2), 0].map((v, i) => (
            <Text
              key={i}
              style={[type_.caption, styles.axisValue, { color: t.text.secondary }]}
              numberOfLines={1}
            >
              {v}
            </Text>
          ))}
        </View>

        <View style={styles.plotWrap} testID="stats-plot">
          {/* Gridlines sit BEHIND the bars and stop at the baseline. */}
          <View pointerEvents="none" style={styles.grid}>
            {[0, 0.5, 1].map((f) => (
              <View
                key={f}
                style={[
                  styles.gridLine,
                  { bottom: AXIS_LABEL_H + f * PLOT_H, backgroundColor: t.border.subtle },
                ]}
              />
            ))}
          </View>

          {scrolls ? (
            <ScrollView
              ref={scroller}
              horizontal
              showsHorizontalScrollIndicator
              scrollEventThrottle={32}
              onScroll={(e) => setScrollX(e.nativeEvent.contentOffset.x)}
              // Newest at the right, and start there: the recent end is what
              // anyone opens this for.
              onContentSizeChange={(w) => {
                scroller.current?.scrollToEnd({ animated: false });
                // `onScroll` does not fire for a programmatic jump on every
                // platform, so seed the offset or every label stays hidden
                // until the first drag.
                setScrollX(Math.max(0, w - avail));
              }}
            >
              {plot}
            </ScrollView>
          ) : (
            plot
          )}
        </View>
      </View>

      {points.some((p) => p.end >= today && p.start <= today) ? (
        <Hint>The outlined bar is the period so far, not a finished one.</Hint>
      ) : null}
    </Panel>
  );
}

/** Width a bare day/month number needs at 10pt, plus breathing room. */
const NARROW_W = 22;

/**
 * Decide the whole x-axis: which bars carry a label, and what each one says.
 *
 * Three ideas that interact, which is why this is one function and not three
 * scattered ones.
 *
 * 1. **Repeat the month only when it changes.** "13 Jul, 14 Jul, 15 Jul…" is a
 *    wall of the same word. A calendar strip — "13 14 15 … 1 Aug 2 3" — says
 *    strictly more with far less ink, and because most labels shrink to two
 *    digits, MORE of them fit. The month comes back exactly where it becomes
 *    new information: at a month boundary, and at the leading edge, where there
 *    is no earlier label to have carried it.
 *
 * 2. **Ticks are thinned by their real width**, walking from the newest end so
 *    the recent side keeps its labels. A month-bearing label needs twice the
 *    room of a bare number, so it can push out a neighbour that a number would
 *    not have — which is why the widths are reconciled after the text is known.
 *
 * 3. **A label that cannot be shown whole is not shown at all**, because a date
 *    sliced by the scroll edge is a WRONG date, not a missing one.
 *
 * The newest bucket is always kept: "how are we doing right now" cannot be the
 * unlabelled bar on the end.
 */
function buildAxis(
  points: StatsPoint[],
  bucketing: StatsBucketing,
  pitch: number,
  visible: (i: number, w: number) => boolean,
): Map<number, string> {
  const out = new Map<number, string>();
  if (points.length === 0) return out;

  const dayNum = (i: number) => String(Number(points[i].start.slice(8, 10)));
  const monName = (i: number) => MONTH_NAMES[Number(points[i].start.slice(5, 7)) - 1];

  // Monthly bars ARE months, so the unit is the month name and the qualifier is
  // the year. Daily and weekly bars are dated, so the unit is the day number.
  const unit = (i: number) => (bucketing === 'month' ? monName(i) : dayNum(i));
  const qualified = (i: number) =>
    bucketing === 'month'
      ? `${monName(i)} ${points[i].start.slice(2, 4)}`
      : `${dayNum(i)} ${monName(i)}`;
  /** What has to change for the qualifier to be worth repeating. */
  const groupOf = (i: number) =>
    bucketing === 'month' ? points[i].start.slice(0, 4) : points[i].start.slice(0, 7);

  // Every bar is a candidate; spacing decides how many survive. That answers
  // "how dense should this be" per screen size instead of guessing once.
  const kept: number[] = [];
  let lastLeft = Number.POSITIVE_INFINITY;
  for (let i = points.length - 1; i >= 0; i--) {
    if (lastLeft - i * pitch < NARROW_W + 6) continue;
    // Reserve the WIDE width when testing visibility: a label near the edge may
    // turn out to need its month, and finding that out after it is placed is
    // how it ends up half off the screen.
    if (!visible(i, LABEL_W)) continue;
    kept.push(i);
    lastLeft = i * pitch;
  }
  kept.reverse();

  // Text, left to right, so "changed since the last label" is judged against
  // what the reader can actually see rather than against hidden bars.
  //
  // The leading label is always qualified: every bare number after it inherits
  // its month, so without it the left of the axis means nothing. And when the
  // visible span contains NO boundary at all — a fortnight sitting inside one
  // month — the trailing label is qualified too, so the month is stated at both
  // extremes instead of being a single word at one end of the chart.
  const spansABoundary = kept.some(
    (i, k) => k > 0 && groupOf(i) !== groupOf(kept[k - 1]),
  );
  for (let k = 0; k < kept.length; k++) {
    const i = kept[k];
    const changed = k > 0 && groupOf(i) !== groupOf(kept[k - 1]);
    const extreme = k === 0 || (!spansABoundary && k === kept.length - 1);
    out.set(i, extreme || changed ? qualified(i) : unit(i));
  }

  // A qualified label is wider than the gap reserved above, so give way to it:
  // drop the plain number beside it rather than let the two touch.
  const need = (LABEL_W + NARROW_W) / 2 + 4;
  for (const i of kept) {
    const text = out.get(i);
    if (!text || !text.includes(' ')) continue;
    for (const j of kept) {
      if (j === i || !out.has(j)) continue;
      if (Math.abs(i - j) * pitch < need && out.get(j)?.includes(' ') === false) out.delete(j);
    }
  }

  return out;
}

/**
 * Where to draw vertical rules, in two weights.
 *
 * The same hierarchy the value axis has, applied to time: a faint line at the
 * next calendar unit down, a firm one at the unit up. That is what lets the eye
 * find "the start of August" without reading a single label — and it steps with
 * the view, because a week division means nothing in a chart of months.
 */
function calendarGrid(
  points: StatsPoint[],
  bucketing: StatsBucketing,
): { minor: Set<number>; major: Set<number> } {
  const minor = new Set<number>();
  const major = new Set<number>();
  for (let i = 1; i < points.length; i++) {
    const cur = points[i].start;
    const prev = points[i - 1].start;
    if (bucketing === 'day') {
      if (startOfWeek(cur) === cur) minor.add(i);
      if (cur.slice(8, 10) === '01') major.add(i);
    } else if (bucketing === 'week') {
      if (cur.slice(0, 7) !== prev.slice(0, 7)) minor.add(i);
      if (cur.slice(0, 4) !== prev.slice(0, 4)) major.add(i);
    } else if (cur.slice(0, 4) !== prev.slice(0, 4)) {
      // Months have no meaningful subdivision here — only the year turns over.
      major.add(i);
    }
  }
  // A major rule replaces the minor one at the same place rather than doubling it.
  for (const i of major) minor.delete(i);
  return { minor, major };
}

/** Round a peak up to something a person reads easily: 1, 2 or 5 × a power of ten. */
function niceMax(peak: number): number {
  if (peak <= 0) return 0;
  if (peak <= 5) return peak;
  const mag = 10 ** Math.floor(Math.log10(peak));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * mag;
    if (candidate >= peak) return Math.round(candidate);
  }
  return Math.round(10 * mag);
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** Spoken and read-out form, e.g. "week of 26 Jul 2026". */
function describeBucket(p: StatsPoint, bucketing: StatsBucketing): string {
  const [y, m, d] = p.start.split('-');
  const long = `${Number(d)} ${MONTH_NAMES[Number(m) - 1]} ${y}`;
  if (bucketing === 'day') return long;
  if (bucketing === 'week') return `week of ${long}`;
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`;
}

const AXIS_LABEL_H = 16;

const styles = StyleSheet.create({
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    flex: 1,
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  /**
   * The dropdown is a third kind of control; separate it like one.
   *
   * The margin is carried HERE rather than left to the screen, because `Screen`
   * only gaps its children on WIDE layouts — the gap lives on `styles.capped`,
   * which is applied only when a maxWidth is set. On a phone its children are
   * flush, so anything that needs air has to ask for it. That is why the chips
   * were sitting nine pixels under the dropdown.
   */
  pickerRow: { marginBottom: space.lg },
  /** Between the two chip groups — twice the gap used inside one. */
  controls: { gap: space.lg },
  /** Within one group. Applies to the wrapped rows too, so chips never crowd. */
  chipGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  readout: { minHeight: 22, justifyContent: 'center' },
  chartRow: { flexDirection: 'row', alignItems: 'flex-end' },
  axis: {
    width: AXIS_W,
    height: PLOT_H + AXIS_LABEL_H,
    paddingBottom: AXIS_LABEL_H,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingRight: space.xs,
  },
  axisValue: { lineHeight: 12 },
  plotWrap: { flex: 1, justifyContent: 'flex-end' },
  grid: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  gridLine: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth },
  plot: { flexDirection: 'row', alignItems: 'flex-end', gap: BAR_GAP },
  column: { alignItems: 'center' },
  barSlot: { height: PLOT_H, justifyContent: 'flex-end', alignItems: 'center' },
  value: { lineHeight: 12 },
  bar: { borderTopLeftRadius: radius.sm, borderTopRightRadius: radius.sm },
  tick: { width: StyleSheet.hairlineWidth, height: 4, marginBottom: 1 },
  vgrid: { position: 'absolute', top: 0, left: 0, right: 0, height: PLOT_H },
  vline: { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth },
  vlineMajor: { width: 1 },
  /** The label's real box. See the note where it is rendered. */
  labelSlot: {
    width: LABEL_W,
    height: AXIS_LABEL_H,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  axisLabel: {
    textAlign: 'center',
    height: AXIS_LABEL_H,
    lineHeight: AXIS_LABEL_H,
    fontSize: 10,
  },
});
