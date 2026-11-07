// SPDX-License-Identifier: Apache-2.0
// Horizontal bars for the panel (docs/ui.md, «Panel»): a row per item, in the order given, with
// its value at the end of its bar, under the pointer and the focus, and the same data in a table.
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  input,
  signal,
  viewChildren,
} from "@angular/core";
import { ChartFrame, type ChartKey, type ChartTable, ChartTip, type TipLine } from "./chart-frame";

/** A row: its name, its value, how the value reads and, maybe, one more figure for the tooltip. */
export interface BarRow {
  readonly label: string;
  readonly value: number;
  readonly text: string;
  readonly detail?: string;
}

/** The drawing, in SVG units: its width, a row's height and the room for the names and values. */
const WIDTH = 560;
const ROW = 30;
const LEFT = 170;
const RIGHT = 70;
/** The marks: 16 high, their end rounded 4 and their base square. */
const BAR = 16;
const RADIUS = 4;

/**
 * Bars of one color from a common base, one per row, in the order given, with each name before
 * its bar and its value after it, in ink. Each row is a transparent button over the drawing, with
 * its values in its name: the chart is one stop of the tab key, the arrows, Home and End go
 * through its rows, and the pointer or the focus light a row up and show its values.
 */
@Component({
  selector: "sp-bar-list",
  imports: [ChartFrame, ChartTip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sp-chart-frame [heading]="heading()" [table]="table()">
      <div class="relative">
        <svg class="block h-auto w-full overflow-visible" [attr.viewBox]="viewBox()" aria-hidden="true">
          <line [attr.x1]="left" [attr.x2]="left" y1="0" [attr.y2]="height()" stroke-width="1" class="stroke-chart-axis" />
          @for (bar of bars(); track $index) {
            <text [attr.x]="left - 10" [attr.y]="bar.y + 12" text-anchor="end" font-size="12" class="fill-text-muted">{{ bar.label }}</text>
            @if (bar.d; as d) {
              <path data-bar [attr.d]="d" [style.fill]="'var(' + color() + ')'" />
            }
            <text [attr.x]="bar.end + 6" [attr.y]="bar.y + 12" font-size="12" class="fill-text tabular-nums">{{ bar.text }}</text>
          }
        </svg>
        <div role="group" class="absolute inset-0 flex flex-col" [attr.aria-label]="heading()" (keydown)="move($event)">
          @for (row of rows(); track $index) {
            <button
              #mark
              type="button"
              data-mark
              class="min-h-0 flex-1 cursor-default rounded-sm border-0 bg-transparent p-0 data-active:bg-text/4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
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
          <sp-chart-tip [title]="tip.title" [lines]="tip.lines" [style.left.%]="tip.x" [style.top.%]="tip.y" />
        }
      </div>
    </sp-chart-frame>
  `,
})
export class BarList {
  readonly heading = input.required<string>();
  /** The header of the table's first column: what the rows are, as «Fase». */
  readonly category = input.required<string>();
  /** What the values are, in the tooltip and the table, as «Mediana». */
  readonly label = input.required<string>();
  /** What a row's detail is, as «Cambios»; without it, no row has one. */
  readonly detailLabel = input<string>();
  readonly rows = input.required<readonly BarRow[]>();
  /** A token of `styles.css`: only the bars wear it. */
  readonly color = input<ChartKey["color"]>("--color-series-1");

  protected readonly left = LEFT;
  protected readonly height = computed(() => this.rows().length * ROW + 4);
  protected readonly viewBox = computed(() => `0 0 ${WIDTH} ${this.height()}`);

  /** The row under the pointer or the focus. */
  protected readonly active = signal<number | undefined>(undefined);
  /** The last row with the focus. */
  private readonly last = signal(0);
  /** The row the tab key comes back to: the last one with the focus. */
  protected readonly stop = computed(() =>
    Math.min(this.last(), Math.max(0, this.rows().length - 1)),
  );
  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>("mark");

  /** Each row's lines: its value and, if it has one, its detail. */
  private readonly lines = computed((): readonly (readonly TipLine[])[] => {
    const detail = this.detailLabel();
    return this.rows().map((row) => [
      { label: this.label(), value: row.text, color: this.color() },
      ...(detail === undefined || row.detail === undefined
        ? []
        : [{ label: detail, value: row.detail }]),
    ]);
  });

  /** Each row's name for a screen reader, as plain text: «Revisión: Mediana 2 h; Cambios 40». */
  protected readonly names = computed(() =>
    this.rows().map((row, index) => {
      const lines = this.lines()[index] ?? [];
      const name = `${row.label}: ${lines.map((line) => `${line.label} ${line.value}`).join("; ")}`;
      // Plain spaces: `Intl` puts a no-break one before «%».
      return name.replace(/\s/g, " ");
    }),
  );

  protected readonly table = computed((): ChartTable => {
    const detail = this.detailLabel();
    return {
      columns: [this.category(), this.label(), ...(detail === undefined ? [] : [detail])],
      rows: this.rows().map((row) => [
        row.label,
        row.text,
        ...(detail === undefined ? [] : [row.detail ?? "—"]),
      ]),
    };
  });

  /** Each bar as it is drawn: its top, its path (none at 0) and where its value goes. */
  protected readonly bars = computed(() => {
    const rows = this.rows();
    const most = Math.max(0, ...rows.map((row) => row.value));
    return rows.map((row, index) => {
      const y = index * ROW + 6;
      const width =
        most === 0 || row.value <= 0 ? 0 : Math.max(2, ((WIDTH - LEFT - RIGHT) * row.value) / most);
      return {
        y,
        label: row.label,
        text: row.text,
        end: LEFT + width,
        ...(width === 0 ? {} : { d: bar(y, width) }),
      };
    });
  });

  protected readonly tip = computed(() => {
    const index = this.active();
    // A row gone with other rows shows nothing.
    if (index === undefined || index >= this.rows().length) return undefined;
    const bar = this.bars()[index];
    return {
      title: this.rows()[index]?.label ?? "",
      lines: this.lines()[index] ?? [],
      x: Math.min(70, (((bar?.end ?? LEFT) + 12) / WIDTH) * 100),
      y: (((bar?.y ?? 0) + BAR + 4) / this.height()) * 100,
    };
  });

  protected focus(index: number): void {
    this.last.set(index);
    this.active.set(index);
  }

  /** The arrows go to the next or the previous row, Home to the first and End to the last. */
  protected move(event: KeyboardEvent): void {
    const last = this.rows().length - 1;
    const current = this.stop();
    const targets: Readonly<Record<string, number>> = {
      ArrowDown: current + 1,
      ArrowRight: current + 1,
      ArrowUp: current - 1,
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

/** A bar from the base at `y`, `width` long: square at the base and round at its end. */
function bar(y: number, width: number): string {
  const r = Math.min(RADIUS, width, BAR / 2);
  const end = LEFT + width;
  return `M${LEFT},${y}H${end - r}Q${end},${y} ${end},${y + r}V${y + BAR - r}Q${end},${y + BAR} ${end - r},${y + BAR}H${LEFT}Z`;
}
