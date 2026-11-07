// SPDX-License-Identifier: Apache-2.0
// A whole in parts for the panel (docs/ui.md, «Panel»): one bar split by share, its key with each
// part's value and share, the values under the pointer and the focus, and the same data in a table.
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
import { moveFocus } from "./chart-parts";

/** A part: its name, the token of its color and its value. */
export interface ChartPart extends ChartKey {
  readonly value: number;
}

/** The drawing, in SVG units, and the room between two parts. */
const WIDTH = 560;
const HEIGHT = 28;
const RADIUS = 4;
const GAP = 2;

/**
 * One bar split into its parts by share, up to three (the palette's colors), 2 apart, with no text
 * inside: under it, a key in ink gives each part's value and share, those at 0 too. Each part
 * drawn is a transparent button over it, with its values in its name: the chart is one stop of the
 * tab key, the arrows, Home and End go through its parts, and the pointer or the focus show them.
 */
@Component({
  selector: "sp-segmented-bar",
  imports: [ChartFrame, ChartTip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sp-chart-frame [heading]="heading()" [table]="table()">
      @if (total() === 0) {
        <p class="m-0 py-3 text-sm text-text-muted" data-none>{{ t()('Sin datos en el periodo', 'No data in the period') }}</p>
      } @else {
        <div class="relative">
          <svg class="block h-auto w-full" [attr.viewBox]="viewBox" aria-hidden="true">
            @for (part of drawn(); track part.label) {
              <rect data-part [attr.x]="part.x" y="0" [attr.width]="part.width" [attr.height]="height" [attr.rx]="radius" [style.fill]="'var(' + part.color + ')'" />
            }
          </svg>
          <div role="group" class="absolute inset-0" [attr.aria-label]="heading()" (keydown)="move($event)">
            @for (part of drawn(); track part.label) {
              <button
                #mark
                type="button"
                data-mark
                class="absolute inset-y-0 cursor-default rounded-sm border-0 bg-transparent p-0 data-active:bg-text/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                [style.left.%]="part.left"
                [style.width.%]="part.share"
                [attr.data-active]="active() === $index ? '' : null"
                [tabIndex]="$index === stop() ? 0 : -1"
                [attr.aria-label]="part.name"
                (pointerenter)="active.set($index)"
                (pointerleave)="active.set(undefined)"
                (focus)="focus($index)"
                (blur)="active.set(undefined)"
              ></button>
            }
          </div>
          @if (tip(); as tip) {
            <sp-chart-tip [style.top]="'calc(100% + 4px)'" [title]="tip.title" [lines]="tip.lines" [style.left.%]="tip.x" [style.transform]="tip.shift" />
          }
        </div>
        <ul class="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs text-text-muted" data-key>
          @for (key of keys(); track key.label) {
            <li class="flex items-center gap-1.5">
              <span class="size-2.5 shrink-0 rounded-[2px]" [style.background]="'var(' + key.color + ')'" aria-hidden="true"></span>
              <span class="text-text">{{ key.label }}</span>&ngsp;<span class="tabular-nums">{{ key.text }}</span>
            </li>
          }
        </ul>
      }
    </sp-chart-frame>
  `,
})
export class SegmentedBar {
  private readonly preferences = inject(Preferences);

  readonly heading = input.required<string>();
  /** The header of the table's first column: what the parts are, as «Canal». */
  readonly category = input.required<string>();
  /** What the values are, in the tooltip and the table, as «Aprobaciones». */
  readonly label = input.required<string>();
  readonly parts = input.required<readonly ChartPart[]>();
  /** How a value reads. */
  readonly format = input<(value: number) => string>();

  protected readonly t = this.preferences.t;
  protected readonly viewBox = `0 0 ${WIDTH} ${HEIGHT}`;
  protected readonly height = HEIGHT;
  protected readonly radius = RADIUS;

  /** The part drawn under the pointer or the focus. */
  protected readonly active = signal<number | undefined>(undefined);
  /** The last part with the focus. */
  private readonly last = signal(0);
  /** The part the tab key comes back to: the last one with the focus. */
  protected readonly stop = computed(() =>
    Math.min(this.last(), Math.max(0, this.drawn().length - 1)),
  );
  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>("mark");

  protected readonly total = computed(() =>
    this.parts().reduce((all, part) => all + Math.max(0, part.value), 0),
  );

  /** How a value and a share read. */
  private readonly read = computed(() => {
    const lang = this.preferences.lang();
    const numbers = new Intl.NumberFormat(lang);
    const percent = new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: 1 });
    const total = this.total();
    return {
      value: this.format() ?? ((value: number) => numbers.format(value)),
      share: (value: number) => (total === 0 ? "—" : percent.format(value / total)),
    };
  });

  /** Each part's lines: its value and its share. */
  private lines(part: ChartPart): readonly TipLine[] {
    const { value, share } = this.read();
    return [
      { label: this.label(), value: value(part.value), color: part.color },
      { label: this.t()("Parte", "Share"), value: share(part.value) },
    ];
  }

  /** The parts above 0, each where it goes in % of the bar, with its name for a screen reader. */
  protected readonly drawn = computed(() => {
    const shown = this.parts().filter((part) => part.value > 0);
    const room = WIDTH - GAP * Math.max(0, shown.length - 1);
    const total = this.total();
    let x = 0;
    return shown.map((part) => {
      const width = (room * part.value) / total;
      const placed = {
        ...part,
        x,
        width,
        left: (x / WIDTH) * 100,
        share: (width / WIDTH) * 100,
        // Plain spaces: `Intl` puts a no-break one before «%».
        name: `${part.label}: ${this.lines(part)
          .map((line) => `${line.label} ${line.value}`)
          .join("; ")}`.replace(/\s/g, " "),
      };
      x += width + GAP;
      return placed;
    });
  });

  /** Every part, those at 0 too, with its value and its share: «42 · 84 %». */
  protected readonly keys = computed(() => {
    const { value, share } = this.read();
    return this.parts().map((part) => ({
      label: part.label,
      color: part.color,
      text: `${value(part.value)} · ${share(part.value)}`,
    }));
  });

  protected readonly table = computed((): ChartTable => {
    const { value, share } = this.read();
    return {
      columns: [this.category(), this.label(), this.t()("Parte", "Share")],
      rows: this.parts().map((part) => [part.label, value(part.value), share(part.value)]),
    };
  });

  protected readonly tip = computed(() => {
    const index = this.active();
    const part = index === undefined ? undefined : this.drawn()[index];
    // A part gone with other values shows nothing.
    if (part === undefined) return undefined;
    const x = part.left + part.share / 2;
    return {
      title: part.label,
      lines: this.lines(part),
      x,
      shift: x > 55 ? "translateX(-100%)" : "none",
    };
  });

  protected focus(index: number): void {
    this.last.set(index);
    this.active.set(index);
  }

  /** The arrows go to the next or the previous part, Home to the first and End to the last. */
  protected move(event: KeyboardEvent): void {
    moveFocus(event, { count: this.drawn().length, current: this.stop(), buttons: this.buttons() });
  }
}
