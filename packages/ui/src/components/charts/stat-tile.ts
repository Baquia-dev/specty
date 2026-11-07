// SPDX-License-Identifier: Apache-2.0
// A figure of the panel (docs/ui.md, «Panel»): its value, its change against the period before
// and, under them, its minigraph, with its value in each day or week under the pointer and the
// focus.
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
import { type ChartKey, ChartTip } from "./chart-frame";

/** The minigraph's height, in px, and the room at its top and bottom for the points. */
const HEIGHT = 36;
const PAD = 6;
/** The minigraph wears the first color of the series, as a single line does. */
const COLOR: ChartKey["color"] = "--color-series-1";
/** Better and worse wear the tones of the phases «hecho» and «cancelado». */
const TONES = { good: "var(--color-phase-done)", bad: "var(--color-phase-cancelled)" } as const;

/** How a figure changed against the period before: better (good), worse (bad) or neither. */
export interface StatDelta {
  readonly tone: "good" | "bad" | "none";
  /** «▲ 12 %», in the tone's color; none when there is no change to show. */
  readonly mark?: string;
  readonly text: string;
}

/** A figure in each day or week of the period, as its minigraph draws it. */
export interface StatTrend {
  /** What it shows, the name of its group for a screen reader: «Cambios cerrados por día». */
  readonly heading: string;
  /** Each day, or each week's first day, as «9 oct». */
  readonly labels: readonly string[];
  /** A value per label; none where nothing measures it. */
  readonly values: readonly (number | null)[];
  /** How a value reads, as the figure does. */
  readonly format: (value: number) => string;
}

/** A point as it is drawn: its center, in % of the width and in px from the top. */
interface Point {
  readonly x: number;
  readonly y: number | null;
}

/**
 * A figure: its label, its value, its change in the tone of a phase and what it is counted on.
 * With a trend, a line of 2 px under them, from its lowest value to its highest, broken where a
 * day has no value, with the last value, a value alone and the one under the pointer or the focus
 * marked. Each day is a transparent button over it, with its value in its name: the minigraph is
 * one stop of the tab key, the arrows, Home and End go through its days, and the pointer or the
 * focus draw a cursor and show the value above it.
 */
@Component({
  selector: "sp-stat-tile",
  imports: [ChartTip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "flex min-w-0 flex-col gap-0.5" },
  template: `
    <span class="text-xs text-text-muted" data-label>{{ label() }}</span>
    <span class="text-[1.625rem] leading-tight font-semibold text-text tabular-nums" data-value>{{ value() }}</span>
    @if (delta(); as delta) {
      <span class="text-xs text-text-muted" data-delta [attr.data-tone]="delta.tone">
        @if (delta.mark; as mark) {
          <span class="font-medium tabular-nums" [style.color]="toneColor(delta.tone)">{{ mark }}</span>
        }
        {{ delta.text }}
      </span>
    }
    @if (note(); as note) {
      <span class="text-xs text-text-muted" data-note>{{ note }}</span>
    }
    @if (trend(); as trend) {
      <div class="mt-auto pt-2" data-trend>
        <div class="relative h-9">
          <svg class="absolute inset-0 block size-full overflow-visible" [attr.viewBox]="viewBox" preserveAspectRatio="none" aria-hidden="true">
            @for (line of lines(); track $index) {
              <path data-line [attr.d]="line" fill="none" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" [style.stroke]="'var(' + color + ')'" />
            }
            @if (cursor(); as x) {
              <line data-cursor [attr.x1]="x" [attr.x2]="x" y1="0" [attr.y2]="height" stroke-width="1" vector-effect="non-scaling-stroke" class="stroke-chart-axis" />
            }
          </svg>
          @for (point of markers(); track point.x) {
            <span data-point class="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg" [style.left.%]="point.x" [style.top.px]="point.y" [style.background]="'var(' + color + ')'"></span>
          }
          @if (names().length > 0) {
            <div role="group" class="absolute inset-0 flex" [attr.aria-label]="trend.heading" (keydown)="move($event)">
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
          }
          @if (tip(); as tip) {
            <sp-chart-tip [title]="tip.title" [lines]="tip.lines" [style.left.%]="tip.x" [style.top]="'auto'" [style.bottom]="'calc(100% + 0.5rem)'" [style.transform]="tip.shift" />
          }
        </div>
      </div>
    }
  `,
})
export class StatTile {
  private readonly preferences = inject(Preferences);

  readonly label = input.required<string>();
  /** The figure as it reads, «—» without one. */
  readonly value = input.required<string>();
  readonly delta = input<StatDelta>();
  /** What the figure is counted on, under it. */
  readonly note = input<string>();
  /** Its value in each day or week of the period; none, and the figure goes alone. */
  readonly trend = input<StatTrend>();

  protected readonly color = COLOR;
  protected readonly height = HEIGHT;
  protected readonly viewBox = `0 0 100 ${HEIGHT}`;

  /** The day under the pointer or the focus. */
  protected readonly active = signal<number | undefined>(undefined);
  /** The last day with the focus. */
  private readonly last = signal(0);
  private readonly labels = computed(() => this.trend()?.labels ?? []);
  private readonly values = computed(() => this.trend()?.values ?? []);
  /** The day the tab key comes back to: the last one with the focus. */
  protected readonly stop = computed(() =>
    Math.min(this.last(), Math.max(0, this.labels().length - 1)),
  );
  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>("mark");

  /** Each day's value as it reads: «sin datos» where there is none. */
  private readonly read = computed(() => {
    const format = this.trend()?.format ?? String;
    const none = this.preferences.t()("sin datos", "no data");
    return this.labels().map((_, index) => {
      const value = this.values()[index] ?? null;
      return value === null ? none : format(value);
    });
  });

  /**
   * Each day's name for a screen reader, as plain text: «9 oct: Cambios cerrados 2». None when no
   * day has a value: there is nothing to go through.
   */
  protected readonly names = computed(() => {
    if (this.values().every((value) => value === null)) return [];
    return this.labels().map((label, index) =>
      plain(`${label}: ${this.label()} ${this.read()[index] ?? ""}`),
    );
  });

  protected readonly points = computed((): readonly Point[] => {
    const values = this.values();
    const present = values.filter((value) => value !== null);
    const low = Math.min(...present);
    const high = Math.max(...present);
    return this.labels().map((_, index) => {
      const value = values[index] ?? null;
      return {
        x: ((index + 0.5) / values.length) * 100,
        y: value === null ? null : yOf(value, low, high),
      };
    });
  });

  /** A line for each stretch of two days or more with a value. */
  protected readonly lines = computed(() =>
    stretchesOf(this.points())
      .filter((run) => run.length > 1)
      .map((run) => run.map(({ x, y }, index) => `${index === 0 ? "M" : "L"}${x},${y}`).join("")),
  );

  /**
   * The points drawn: the last value, a value with no neighbor, which no line shows, and the one
   * under the pointer or the focus.
   */
  protected readonly markers = computed(() => {
    const points = this.points();
    const lastIndex = points.findLastIndex((point) => point.y !== null);
    const active = this.active();
    return points.flatMap((point, index) => {
      if (point.y === null) return [];
      const alone =
        (points[index - 1]?.y ?? null) === null && (points[index + 1]?.y ?? null) === null;
      return index === lastIndex || index === active || alone ? [{ x: point.x, y: point.y }] : [];
    });
  });

  /** Where the cursor goes: the day under the pointer or the focus. */
  protected readonly cursor = computed(() => {
    const index = this.active();
    return index === undefined ? undefined : this.points()[index]?.x;
  });

  protected readonly tip = computed(() => {
    const index = this.active();
    // A day gone with other days (another period) shows nothing.
    if (index === undefined || index >= this.labels().length) return undefined;
    const x = this.points()[index]?.x ?? 0;
    return {
      title: this.labels()[index] ?? "",
      lines: [{ label: this.label(), value: this.read()[index] ?? "", color: COLOR }],
      x,
      // Right of the cursor, or left of it past the middle, so it stays over the figure.
      shift: x > 55 ? "translateX(calc(-100% - 12px))" : "translateX(12px)",
    };
  });

  protected toneColor(tone: StatDelta["tone"]): string | null {
    return tone === "none" ? null : TONES[tone];
  }

  protected focus(index: number): void {
    this.last.set(index);
    this.active.set(index);
  }

  /** The arrows go to the next or the previous day, Home to the first and End to the last. */
  protected move(event: KeyboardEvent): void {
    const last = this.labels().length - 1;
    const current = this.stop();
    const targets: Readonly<Record<string, number>> = {
      ArrowRight: current + 1,
      ArrowLeft: current - 1,
      Home: 0,
      End: last,
    };
    const target = targets[event.key];
    if (target === undefined) return;
    event.preventDefault();
    this.buttons()[Math.min(last, Math.max(0, target))]?.nativeElement.focus();
  }
}

/** The height of `value` from `low`, at the bottom, to `high`, at the top; the middle if equal. */
function yOf(value: number, low: number, high: number): number {
  if (high === low) return HEIGHT / 2;
  return PAD + (HEIGHT - 2 * PAD) * (1 - (value - low) / (high - low));
}

/** `text` with plain spaces: `Intl` puts a no-break one before «%». */
function plain(text: string): string {
  return text.replace(/\s/g, " ");
}

/** The stretches of points that have a value, in order. */
function stretchesOf(points: readonly Point[]): { readonly x: number; readonly y: number }[][] {
  const runs: { readonly x: number; readonly y: number }[][] = [];
  let current: { readonly x: number; readonly y: number }[] = [];
  for (const { x, y } of points) {
    if (y === null) {
      if (current.length > 0) runs.push(current);
      current = [];
    } else current.push({ x, y });
  }
  if (current.length > 0) runs.push(current);
  return runs;
}
