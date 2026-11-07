// SPDX-License-Identifier: Apache-2.0
// A line for the panel (docs/ui.md, «Panel»): one series over time, with a gap where a day has no
// value, its values under the pointer and the focus, and the same data in a table.
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
import { ChartFrame, type ChartKey, type ChartTable, ChartTip } from "./chart-frame";
import { linePath, moveFocus, plain, roundScale, stretchesOf } from "./chart-parts";

/** The drawing, in SVG units: its size and the margins of the plot. */
const WIDTH = 560;
const HEIGHT = 170;
const LEFT = 48;
const RIGHT = 44;
const TOP = 12;
const BOTTOM = 22;
/** At most this many labels under the axis. */
const X_LABELS = 9;

/** A point as it is drawn: its center, and its label under the axis if it has one. */
interface Point {
  readonly x: number;
  readonly y: number | null;
  readonly label?: string;
}

/**
 * One series over time, on one axis: a line of 2 px with a wash of 10 % under it, broken where a
 * label has no value, and the last value marked with a ring of the surface's color and its value.
 * Each label is a transparent button over the drawing, with its value in its name: the chart is one
 * stop of the tab key, the arrows, Home and End go through its labels, and the pointer or the
 * focus draw a cursor and show the value.
 */
@Component({
  selector: "sp-line-chart",
  imports: [ChartFrame, ChartTip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sp-chart-frame [heading]="heading()" [table]="table()">
      @if (empty()) {
        <p class="m-0 py-8 text-center text-sm text-text-muted" data-none>{{ t()('Sin datos en el periodo', 'No data in the period') }}</p>
      } @else {
        <div class="relative">
          <svg class="block h-auto w-full overflow-visible" [attr.viewBox]="viewBox" aria-hidden="true">
            @for (tick of ticks(); track tick.value) {
              <line [attr.x1]="left" [attr.x2]="right" [attr.y1]="tick.y" [attr.y2]="tick.y" stroke-width="1" [class]="$first ? 'stroke-chart-axis' : 'stroke-chart-grid'" />
              <text [attr.x]="left - 6" [attr.y]="tick.y + 4" text-anchor="end" font-size="11" class="fill-text-muted tabular-nums">{{ tick.label }}</text>
            }
            @for (run of runs(); track $index) {
              <path data-area [attr.d]="run.area" [style.fill]="'var(' + color() + ')'" opacity="0.1" />
              <path data-line [attr.d]="run.line" fill="none" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" [style.stroke]="'var(' + color() + ')'" />
            }
            @for (point of points(); track $index) {
              @if (point.label; as label) {
                <text [attr.x]="point.x" [attr.y]="bottom" text-anchor="middle" font-size="11" class="fill-text-muted">{{ label }}</text>
              }
            }
            @if (cursor(); as x) {
              <line data-cursor [attr.x1]="x" [attr.x2]="x" [attr.y1]="top" [attr.y2]="base" stroke-width="1" class="stroke-chart-axis" />
            }
            @for (marker of markers(); track marker.x) {
              <circle data-point [attr.cx]="marker.x" [attr.cy]="marker.y" r="4" stroke-width="2" class="stroke-bg" [style.fill]="'var(' + color() + ')'" />
              @if (marker.text; as value) {
                <text [attr.x]="marker.x + 8" [attr.y]="marker.y + 4" font-size="11" class="fill-text-muted tabular-nums">{{ value }}</text>
              }
            }
          </svg>
          <div role="group" class="absolute inset-y-0 flex" [style.left.%]="plot.left" [style.right.%]="plot.right" [attr.aria-label]="heading()" (keydown)="move($event)">
            @for (name of names(); track $index) {
              <button
                #mark
                type="button"
                data-mark
                class="min-w-0 flex-1 cursor-default rounded-sm border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
                [tabIndex]="$index === stop() ? 0 : -1"
                [attr.aria-label]="name"
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
      }
    </sp-chart-frame>
  `,
})
export class LineChart {
  private readonly preferences = inject(Preferences);

  readonly heading = input.required<string>();
  /** The header of the table's first column: what the labels are, as «Día». */
  readonly category = input.required<string>();
  readonly labels = input.required<readonly string[]>();
  /** A value per label; none where nothing was measured. */
  readonly values = input.required<readonly (number | null)[]>();
  /** The series' name, in the tooltip and the table, as «Pasan». */
  readonly label = input.required<string>();
  /** A token of `styles.css`: only the marks wear it. */
  readonly color = input<ChartKey["color"]>("--color-series-1");
  /** How a value reads, on the axis too. */
  readonly format = input<(value: number) => string>();
  /** The axis' ends: from 0, and up to a round value past the highest, unless they are given. */
  readonly min = input(0);
  readonly max = input<number>();

  protected readonly t = this.preferences.t;
  protected readonly viewBox = `0 0 ${WIDTH} ${HEIGHT}`;
  protected readonly left = LEFT;
  protected readonly right = WIDTH - RIGHT;
  protected readonly top = TOP;
  protected readonly base = HEIGHT - BOTTOM;
  protected readonly bottom = HEIGHT - 6;
  /** Where the buttons go over the drawing, in % of its width. */
  protected readonly plot = { left: (LEFT / WIDTH) * 100, right: (RIGHT / WIDTH) * 100 };

  /** The label under the pointer or the focus. */
  protected readonly active = signal<number | undefined>(undefined);
  /** The last label with the focus. */
  private readonly last = signal(0);
  /** The label the tab key comes back to: the last one with the focus. */
  protected readonly stop = computed(() =>
    Math.min(this.last(), Math.max(0, this.labels().length - 1)),
  );
  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>("mark");

  protected readonly empty = computed(() => this.values().every((value) => value === null));

  private readonly text = computed(() => {
    const given = this.format();
    const numbers = new Intl.NumberFormat(this.preferences.lang());
    return given ?? ((value: number) => numbers.format(value));
  });

  /** Each label's value as it reads: «sin datos» where there is none. */
  private readonly read = computed(() => {
    const format = this.text();
    const none = this.t()("sin datos", "no data");
    return this.labels().map((_, index) => {
      const value = this.values()[index] ?? null;
      return value === null ? none : format(value);
    });
  });

  /** Each label's name for a screen reader, as plain text: «7 nov: Pasan 97 %». */
  protected readonly names = computed(() =>
    this.labels().map((label, index) =>
      plain(`${label}: ${this.label()} ${this.read()[index] ?? ""}`),
    ),
  );

  protected readonly table = computed(
    (): ChartTable => ({
      columns: [this.category(), this.label()],
      rows: this.labels().map((label, index) => {
        const value = this.values()[index] ?? null;
        return [label, value === null ? "—" : (this.read()[index] ?? "")];
      }),
    }),
  );

  private readonly scale = computed(() => {
    const present = this.values().filter((value) => value !== null);
    const highest = this.max() ?? Math.max(this.min() + 1, ...present);
    return roundScale(this.min(), highest, { fixed: this.max() });
  });

  protected readonly ticks = computed(() => {
    const format = this.text();
    const { low, high, ticks } = this.scale();
    return ticks.map((value) => ({ value, y: yOf(value, low, high), label: format(value) }));
  });

  protected readonly points = computed((): readonly Point[] => {
    const labels = this.labels();
    const { low, high } = this.scale();
    const band = (WIDTH - LEFT - RIGHT) / Math.max(1, labels.length);
    const every = Math.ceil(labels.length / X_LABELS);
    return labels.map((label, index) => {
      const value = this.values()[index] ?? null;
      return {
        x: LEFT + band * (index + 0.5),
        y: value === null ? null : yOf(value, low, high),
        ...(index % every === 0 ? { label } : {}),
      };
    });
  });

  /** The stretches of labels with a value, each a line and the wash under it. */
  protected readonly runs = computed(() => {
    const base = HEIGHT - BOTTOM;
    return stretchesOf(this.points()).map((run) => {
      const line = linePath(run);
      const first = run[0];
      const last = run.at(-1);
      const area =
        first === undefined || last === undefined
          ? ""
          : `M${first.x},${base}${run.map(({ x, y }) => `L${x},${y}`).join("")}L${last.x},${base}Z`;
      return { line, area };
    });
  });

  /**
   * The points drawn alone: the last value, with its value beside it, a value with no neighbor,
   * which no line shows, and the one under the pointer or the focus.
   */
  protected readonly markers = computed(() => {
    const points = this.points();
    const lastIndex = points.findLastIndex((point) => point.y !== null);
    const active = this.active();
    return points.flatMap((point, index) => {
      if (point.y === null) return [];
      const alone =
        (points[index - 1]?.y ?? null) === null && (points[index + 1]?.y ?? null) === null;
      if (index !== lastIndex && index !== active && !alone) return [];
      return [
        { x: point.x, y: point.y, text: index === lastIndex ? this.read()[index] : undefined },
      ];
    });
  });

  /** Where the cursor goes: the label under the pointer or the focus. */
  protected readonly cursor = computed(() => {
    const index = this.active();
    return index === undefined ? undefined : this.points()[index]?.x;
  });

  protected readonly tip = computed(() => {
    const index = this.active();
    // A label gone with other labels (another period) shows nothing.
    if (index === undefined || index >= this.labels().length) return undefined;
    const x = ((this.points()[index]?.x ?? 0) / WIDTH) * 100;
    return {
      title: this.labels()[index] ?? "",
      lines: [{ label: this.label(), value: this.read()[index] ?? "", color: this.color() }],
      x,
      // Right of the cursor, or left of it past the middle, so it stays inside the chart.
      shift: x > 55 ? "translateX(calc(-100% - 12px))" : "translateX(12px)",
    };
  });

  protected focus(index: number): void {
    this.last.set(index);
    this.active.set(index);
  }

  /** The arrows go to the next or the previous label, Home to the first and End to the last. */
  protected move(event: KeyboardEvent): void {
    moveFocus(event, {
      count: this.labels().length,
      current: this.stop(),
      buttons: this.buttons(),
    });
  }
}

/** The height of `value` on an axis from `low` to `high`. */
function yOf(value: number, low: number, high: number): number {
  return TOP + (HEIGHT - TOP - BOTTOM) * (1 - (value - low) / (high - low || 1));
}
