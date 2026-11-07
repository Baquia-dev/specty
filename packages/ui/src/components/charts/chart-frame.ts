// SPDX-License-Identifier: Apache-2.0
// What every chart of the panel shares (docs/ui.md, «Panel»): its heading, its legend, the same
// data in a table and the tooltip with the values of a mark.
import { ChangeDetectionStrategy, Component, inject, input, signal } from "@angular/core";
import { Preferences } from "../../theme/preferences";

/** A series as the legend shows it: its name and the token of its color. */
export interface ChartKey {
  readonly label: string;
  /** A token of `styles.css`, as `--color-series-1`: only the marks wear it, never the text. */
  readonly color: `--${string}`;
}

/** A chart's data as text: the headers, and a row of cells per mark, its label first. */
export interface ChartTable {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

/** A line of the tooltip: a series, or the total, with its value. */
export interface TipLine {
  readonly label: string;
  readonly value: string;
  readonly color?: `--${string}`;
}

const HEAD =
  "border-b border-border px-2 py-1.5 text-xs font-semibold whitespace-nowrap text-text-muted";
const CELL = "px-2 py-1.5 text-right whitespace-nowrap tabular-nums";

/**
 * The frame of a chart: its heading, its legend when it has two series or more (one needs none:
 * the heading names it) and «Ver tabla», which swaps the chart, projected inside, for a table with
 * the same data.
 */
@Component({
  selector: "sp-chart-frame",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "flex min-w-0 flex-col gap-2" },
  template: `
    <div class="flex items-baseline justify-between gap-3">
      <h3 class="m-0 text-sm font-semibold" data-chart-heading>{{ heading() }}</h3>
      <button
        type="button"
        class="cursor-pointer rounded-sm border-0 bg-transparent p-0 font-sans text-xs whitespace-nowrap text-text-muted underline underline-offset-2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        data-chart-toggle
        [attr.aria-pressed]="tabular()"
        (click)="tabular.set(!tabular())"
      >
        {{ tabular() ? t()('Ver gráfica', 'Show chart') : t()('Ver tabla', 'Show table') }}
      </button>
    </div>
    @if (tabular()) {
      <div class="max-h-80 overflow-auto">
        <table class="w-full border-collapse text-sm" data-chart-table>
          <caption class="sr-only">{{ heading() }}</caption>
          <thead>
            <tr>
              @for (column of table().columns; track $index) {
                <th scope="col" [class]="HEAD + ($first ? ' text-left' : ' text-right')">{{ column }}</th>
              }
            </tr>
          </thead>
          <tbody>
            @for (row of table().rows; track $index) {
              <tr class="hover:bg-text/4">
                @for (cell of row; track $index) {
                  @if ($first) {
                    <th scope="row" class="px-2 py-1.5 text-left font-normal whitespace-nowrap">{{ cell }}</th>
                  } @else {
                    <td [class]="CELL">{{ cell }}</td>
                  }
                }
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      @if (legend().length > 1) {
        <ul class="m-0 flex list-none flex-wrap gap-x-3.5 gap-y-1 p-0 text-xs text-text-muted" data-legend>
          @for (key of legend(); track key.label) {
            <li class="flex items-center gap-1.5">
              <span class="size-2.5 shrink-0 rounded-[2px]" [style.background]="'var(' + key.color + ')'" aria-hidden="true"></span>
              {{ key.label }}
            </li>
          }
        </ul>
      }
      <ng-content />
    }
  `,
})
export class ChartFrame {
  readonly heading = input.required<string>();
  readonly legend = input<readonly ChartKey[]>([]);
  readonly table = input.required<ChartTable>();

  protected readonly t = inject(Preferences).t;
  protected readonly tabular = signal(false);
  protected readonly HEAD = HEAD;
  protected readonly CELL = CELL;
}

/**
 * The values of a mark, next to it, under the pointer or the focus. Screen readers hear them in
 * the mark's own name, so it is hidden from them.
 */
@Component({
  selector: "sp-chart-tip",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      "pointer-events-none absolute top-2 z-10 w-max min-w-32 whitespace-nowrap rounded-md border border-(--color-tooltip-border) bg-(--color-tooltip-bg) px-2.5 py-2 text-xs text-(--color-tooltip-text) shadow-md",
    "aria-hidden": "true",
    "data-chart-tip": "",
  },
  template: `
    <div class="mb-1 opacity-70" data-tip-title>{{ title() }}</div>
    @for (line of lines(); track line.label) {
      <div class="flex items-center justify-between gap-4" data-tip-row>
        <span class="inline-flex items-center gap-1.5">
          @if (line.color; as color) {
            <span class="inline-block h-0.5 w-3 rounded-[1px]" [style.background]="'var(' + color + ')'"></span>
          }
          {{ line.label }}
        </span>
        <strong class="font-semibold tabular-nums">{{ line.value }}</strong>
      </div>
    }
  `,
})
export class ChartTip {
  readonly title = input.required<string>();
  readonly lines = input.required<readonly TipLine[]>();
}
