// SPDX-License-Identifier: Apache-2.0
// Columns, stacked by series, for the panel (docs/ui.md, «Panel»): a mark per day or week, with
// its values under the pointer and the focus, and the same data in a table.
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  inject,
  input,
  signal,
  viewChildren,
} from "@angular/core";
import { Preferences } from "../../theme/preferences";
import { ChartFrame, type ChartKey, type ChartTable, ChartTip, type TipLine } from "./chart-frame";
import { moveFocus, roundScale } from "./chart-parts";

/** A series: its name, the token of its color and a value per label. */
export interface ChartSeries extends ChartKey {
  readonly values: readonly number[];
}

/** The drawing, in SVG units: its size and the margins of the plot. */
const WIDTH = 560;
const HEIGHT = 170;
const LEFT = 40;
const RIGHT = 8;
const TOP = 10;
const BOTTOM = 22;
/** The marks: at most 24 wide, their end rounded 4, and 2 between the segments of a stack. */
const BAR = 24;
const RADIUS = 4;
const GAP = 2;
/** At most this many labels under the axis. */
const X_LABELS = 9;

/** A column as it is drawn: its center, its label under the axis if it has one, its segments. */
interface Column {
  readonly x: number;
  readonly label?: string;
  readonly segments: readonly { readonly d: string; readonly color: string }[];
}

/**
 * Columns stacked by series, one per label, on one axis that starts at zero. Each column is a
 * transparent button over the drawing, with its values in its name: the chart is one stop of the
 * tab key, the arrows, Home and End go through its columns, and the pointer or the focus light a
 * column up and show its values, with their total when there are several series.
 */
@Component({
  selector: "sp-column-chart",
  imports: [ChartFrame, ChartTip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sp-chart-frame [heading]="heading()" [legend]="series()" [table]="table()">
      <div class="relative">
        <svg class="block h-auto w-full overflow-visible" [attr.viewBox]="viewBox" aria-hidden="true">
          @for (tick of ticks(); track tick.value) {
            <line [attr.x1]="left" [attr.x2]="right" [attr.y1]="tick.y" [attr.y2]="tick.y" stroke-width="1" [class]="tick.value === 0 ? 'stroke-chart-axis' : 'stroke-chart-grid'" />
            <text data-tick [attr.x]="left - 6" [attr.y]="tick.y + 4" text-anchor="end" font-size="11" class="fill-text-muted tabular-nums">{{ tick.label }}</text>
          }
          @for (column of columns(); track $index) {
            @for (segment of column.segments; track $index) {
              <path data-segment [attr.d]="segment.d" [style.fill]="'var(' + segment.color + ')'" />
            }
            @if (column.label; as label) {
              <text data-x-label [attr.x]="column.x" [attr.y]="bottom" text-anchor="middle" font-size="11" class="fill-text-muted">{{ label }}</text>
            }
          }
        </svg>
        <div role="group" class="absolute inset-y-0 flex" [style.left.%]="plot.left" [style.right.%]="plot.right" [attr.aria-label]="heading()" (keydown)="move($event)">
          @for (label of labels(); track $index) {
            <button
              #column
              type="button"
              data-column
              class="min-w-0 flex-1 cursor-default rounded-sm border-0 bg-transparent p-0 data-active:bg-text/4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
              [attr.data-active]="active() === $index ? '' : null"
              [tabIndex]="$index === stop() ? 0 : -1"
              [attr.aria-label]="names()[$index]"
              (pointerenter)="active.set($index)"
              (pointerleave)="active.set(undefined)"
              (focus)="focus($index)"
              (blur)="active.set(undefined)"
            ></button>
          }
        </div>
        @if (tip(); as tip) {
          <sp-chart-tip [title]="tip.title" [lines]="tip.lines" [style.left.%]="tip.x" [style.transform]="tip.shift" />
        }
      </div>
    </sp-chart-frame>
  `,
})
export class ColumnChart {
  private readonly preferences = inject(Preferences);

  readonly heading = input.required<string>();
  /** The header of the table's first column: what the labels are, as «Día». */
  readonly category = input.required<string>();
  readonly labels = input.required<readonly string[]>();
  readonly series = input.required<readonly ChartSeries[]>();

  protected readonly viewBox = `0 0 ${WIDTH} ${HEIGHT}`;
  protected readonly left = LEFT;
  protected readonly right = WIDTH - RIGHT;
  protected readonly bottom = HEIGHT - 6;
  /** Where the buttons go over the drawing, in % of its width. */
  protected readonly plot = { left: (LEFT / WIDTH) * 100, right: (RIGHT / WIDTH) * 100 };

  /** The column under the pointer or the focus. */
  protected readonly active = signal<number | undefined>(undefined);
  /** The last column with the focus. */
  private readonly cursor = signal(0);
  /** The column the tab key comes back to: the last one with the focus, or the last one left. */
  protected readonly stop = computed(() =>
    Math.min(this.cursor(), Math.max(0, this.labels().length - 1)),
  );
  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>("column");

  private readonly format = computed(() => {
    const numbers = new Intl.NumberFormat(this.preferences.lang());
    return (value: number) => numbers.format(value);
  });

  /** Each column's lines: a value per series and, with several, their total. */
  private readonly lines = computed((): readonly (readonly TipLine[])[] => {
    const series = this.series();
    const format = this.format();
    const total = this.preferences.t()("Total", "Total");
    return this.labels().map((_, index) => {
      const values = series.map((one) => one.values[index] ?? 0);
      const lines = series.map((one, at) => ({
        label: one.label,
        value: format(values[at] ?? 0),
        color: one.color,
      }));
      if (series.length < 2) return lines;
      return [...lines, { label: total, value: format(values.reduce((all, one) => all + one, 0)) }];
    });
  });

  /** Each column's name for a screen reader: «7 nov: Feature 2; Quick 1; Total 3». */
  protected readonly names = computed(() =>
    this.labels().map((label, index) => {
      const lines = this.lines()[index] ?? [];
      return `${label}: ${lines.map((line) => `${line.label} ${line.value}`).join("; ")}`;
    }),
  );

  protected readonly table = computed((): ChartTable => {
    const series = this.series();
    return {
      columns: [
        this.category(),
        ...series.map((one) => one.label),
        ...(series.length > 1 ? [this.preferences.t()("Total", "Total")] : []),
      ],
      rows: this.labels().map((label, index) => [
        label,
        ...(this.lines()[index] ?? []).map((line) => line.value),
      ]),
    };
  });

  /** The axis: round steps from zero up to the tallest column, whole when the values are. */
  private readonly scale = computed(() => {
    const series = this.series();
    const totals = this.labels().map((_, index) =>
      series.reduce((all, one) => all + (one.values[index] ?? 0), 0),
    );
    const whole = series.every((one) => one.values.every(Number.isInteger));
    const { high, ticks } = roundScale(0, Math.max(1, ...totals), { whole });
    return { top: high, ticks };
  });

  protected readonly ticks = computed(() => {
    const format = this.format();
    const { top, ticks } = this.scale();
    return ticks.map((value) => ({ value, y: yOf(value, top), label: format(value) }));
  });

  protected readonly columns = computed((): readonly Column[] => {
    const labels = this.labels();
    const series = this.series();
    const { top } = this.scale();
    const band = (WIDTH - LEFT - RIGHT) / Math.max(1, labels.length);
    const width = Math.min(BAR, band * 0.62);
    const every = Math.ceil(labels.length / X_LABELS);
    return labels.map((label, index) => {
      const x = LEFT + band * (index + 0.5);
      return {
        x,
        ...(index % every === 0 ? { label } : {}),
        segments: stackOf(series, index, x - width / 2, width, top),
      };
    });
  });

  protected readonly tip = computed(() => {
    const index = this.active();
    // A column gone with other labels (another period) shows nothing.
    if (index === undefined || index >= this.labels().length) return undefined;
    const x = ((this.columns()[index]?.x ?? 0) / WIDTH) * 100;
    return {
      title: this.labels()[index] ?? "",
      lines: this.lines()[index] ?? [],
      x,
      // Right of the column, or left of it past the middle, so it stays inside the chart.
      shift: x > 55 ? "translateX(calc(-100% - 12px))" : "translateX(12px)",
    };
  });

  protected focus(index: number): void {
    this.cursor.set(index);
    this.active.set(index);
  }

  /** The arrows go to the next or the previous column, Home to the first and End to the last. */
  protected move(event: KeyboardEvent): void {
    moveFocus(event, {
      count: this.labels().length,
      current: this.stop(),
      buttons: this.buttons(),
    });
  }
}

/** The height of `value` on an axis that reaches `top`. */
function yOf(value: number, top: number): number {
  return TOP + (HEIGHT - TOP - BOTTOM) * (1 - value / top);
}

/**
 * The segments of the column at `index`, from the axis up: one per series above zero, 2 apart,
 * the top one with its end rounded and the rest square.
 */
function stackOf(
  series: readonly ChartSeries[],
  index: number,
  x: number,
  width: number,
  top: number,
): Column["segments"] {
  const shown = series.filter((one) => (one.values[index] ?? 0) > 0);
  let base = 0;
  return shown.map((one, at) => {
    const value = one.values[index] ?? 0;
    const lower = yOf(base, top) - (at === 0 ? 0 : GAP);
    const upper = yOf(base + value, top);
    base += value;
    return { d: bar(x, width, upper, lower, at === shown.length - 1), color: one.color };
  });
}

/** A bar from `upper` down to `lower`, square at the bottom and, if `rounded`, round on top. */
function bar(x: number, width: number, upper: number, lower: number, rounded: boolean): string {
  const top = Math.min(upper, lower);
  const r = rounded ? Math.min(RADIUS, lower - top, width / 2) : 0;
  const right = x + width;
  // Square corners are a curve of no size: the same path either way.
  return `M${x},${lower}V${top + r}Q${x},${top} ${x + r},${top}H${right - r}Q${right},${top} ${right},${top + r}V${lower}Z`;
}
