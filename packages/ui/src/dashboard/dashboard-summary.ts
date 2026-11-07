// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from "@angular/core";
import type { StatsFigure, StatsPeriod, StatsView } from "@baquia-dev/specty-core";
import type { Lang } from "@baquia-dev/specty-core/light";
import { type StatDelta, StatTile, type StatTrend } from "../components/charts/stat-tile";
import { formatDuration } from "../data/progress";
import { Preferences } from "../theme/preferences";
import { percent, shortDay, usd } from "./dashboard-format";

type Translate = (es: string, en: string) => string;

/** How many days each period compares with: «all» compares with nothing. */
const DAYS: Readonly<Record<StatsPeriod, number | undefined>> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: undefined,
};

/** A figure of the first row, as the page shows it. */
interface Tile {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly delta?: StatDelta;
  readonly note?: string;
  readonly trend?: StatTrend;
}

/** The figures by day or by week as text: the headers, and a row of cells per day or week. */
interface TrendTable {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

const HEAD =
  "border-b border-border px-2 py-1.5 text-xs font-semibold whitespace-nowrap text-text-muted";
const CELL = "px-2 py-1.5 text-right whitespace-nowrap tabular-nums";

/**
 * The first row of the «Panel» (docs/ui.md): its six figures, each with its value in the page's
 * language, its change against the period before, in the tone of a phase when it is better or
 * worse, what it is counted on and its minigraph, with its value in each day or week. Under them,
 * «Ver tabla» opens the same values in a table.
 */
@Component({
  selector: "sp-dashboard-summary",
  imports: [StatTile],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "flex flex-col gap-3 border-b border-border pb-6" },
  template: `
    <div class="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-6" data-kpis>
      @for (tile of tiles(); track tile.id) {
        <sp-stat-tile [attr.data-kpi]="tile.id" [label]="tile.label" [value]="tile.value" [delta]="tile.delta" [note]="tile.note" [trend]="tile.trend" />
      }
    </div>
    @if (table(); as table) {
      <div class="flex justify-end">
        <button
          type="button"
          class="cursor-pointer rounded-sm border-0 bg-transparent p-0 font-sans text-xs whitespace-nowrap text-text-muted underline underline-offset-2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          data-kpis-toggle
          [attr.aria-pressed]="tabular()"
          (click)="tabular.set(!tabular())"
        >
          {{ tabular() ? t()('Ocultar tabla', 'Hide table') : t()('Ver tabla', 'Show table') }}
        </button>
      </div>
      @if (tabular()) {
        <div class="max-h-80 overflow-auto">
          <table class="w-full border-collapse text-sm" data-kpis-table>
            <caption class="sr-only">{{ t()('Indicadores', 'Figures') }}</caption>
            <thead>
              <tr>
                @for (column of table.columns; track $index) {
                  <th scope="col" [class]="HEAD + ($first ? ' text-left' : ' text-right')">{{ column }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (row of table.rows; track $index) {
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
      }
    }
  `,
})
export class DashboardSummary {
  private readonly preferences = inject(Preferences);

  /** The panel of the cut in sight. */
  readonly view = input.required<StatsView>();

  protected readonly t = this.preferences.t;
  protected readonly tabular = signal(false);
  protected readonly HEAD = HEAD;
  protected readonly CELL = CELL;

  protected readonly tiles = computed(() =>
    tilesOf(this.view(), this.preferences.t(), this.preferences.lang()),
  );

  /** The six figures in each day or week, when the view has them. */
  protected readonly table = computed(() =>
    tableOf(this.view(), this.preferences.t(), this.preferences.lang()),
  );
}

/** How a figure's value reads: a count, a duration, a share or US dollars. */
type Shape = "count" | "duration" | "share" | "usd";

/** The six figures, in the order of the row: whether going up is good, and how each reads. */
const FIGURES = [
  { id: "closed", es: "Cambios cerrados", en: "Changes closed", upIsGood: true, shape: "count" },
  { id: "tasks", es: "Tareas completadas", en: "Tasks completed", upIsGood: true, shape: "count" },
  { id: "cycle", es: "Ciclo (mediana)", en: "Cycle (median)", upIsGood: false, shape: "duration" },
  {
    id: "verifications",
    es: "Verificaciones que pasan",
    en: "Verifications passing",
    upIsGood: true,
    shape: "share",
  },
  { id: "cost", es: "Coste medido", en: "Measured cost", upIsGood: false, shape: "usd" },
  {
    id: "pending",
    es: "Pendientes abiertos",
    en: "Open pending items",
    upIsGood: false,
    shape: "count",
  },
] as const satisfies readonly {
  readonly id: keyof StatsView["summary"];
  readonly es: string;
  readonly en: string;
  readonly upIsGood: boolean;
  readonly shape: Shape;
}[];

/** The six figures, with their values in the page's language, their changes, notes and trends. */
function tilesOf(view: StatsView, t: Translate, lang: Lang): readonly Tile[] {
  const days = DAYS[view.query.period];
  const { trend } = view;
  const labels = trend?.buckets.map((bucket) => shortDay(bucket.from, lang)) ?? [];
  return FIGURES.map(({ id, es, en, upIsGood, shape }) => {
    const figure = view.summary[id];
    const delta = deltaOf(figure, upIsGood, days, t, lang);
    const note = noteOf(id, view.summary, t, lang);
    const series: StatTrend | undefined = trend && {
      heading:
        trend.unit === "week"
          ? t(`${es} por semana`, `${en} per week`)
          : t(`${es} por día`, `${en} per day`),
      labels,
      values: trend.buckets.map((bucket) => bucket[id]),
      format: (value) => shownValue(value, shape, lang),
    };
    return {
      id,
      label: t(es, en),
      value: figure.value === null ? "—" : shownValue(figure.value, shape, lang),
      ...(delta === undefined ? {} : { delta }),
      ...(note === undefined ? {} : { note }),
      ...(series === undefined ? {} : { trend: series }),
    };
  });
}

/** The six figures in each day or week of the view, «—» where one has no value; none without. */
function tableOf(view: StatsView, t: Translate, lang: Lang): TrendTable | undefined {
  const { trend } = view;
  if (trend === undefined) return undefined;
  return {
    columns: [
      trend.unit === "week" ? t("Semana del", "Week of") : t("Día", "Day"),
      ...FIGURES.map(({ es, en }) => t(es, en)),
    ],
    rows: trend.buckets.map((bucket) => [
      shortDay(bucket.from, lang),
      ...FIGURES.map(({ id, shape }) => {
        const value = bucket[id];
        return value === null ? "—" : shownValue(value, shape, lang);
      }),
    ]),
  };
}

function shownValue(value: number, shape: Shape, lang: Lang): string {
  switch (shape) {
    case "duration":
      return formatDuration(value, lang);
    case "share":
      return percent(value, lang, 1);
    case "usd":
      return usd(value, lang);
    default:
      return new Intl.NumberFormat(lang).format(value);
  }
}

/** What a figure is counted on, under it: the cycle's ends, the verifications, the cost's changes. */
function noteOf(
  id: keyof StatsView["summary"],
  summary: StatsView["summary"],
  t: Translate,
  lang: Lang,
): string | undefined {
  const count = (value: number) => new Intl.NumberFormat(lang).format(value);
  const { verifications, cost } = summary;
  switch (id) {
    case "cycle":
      return t("de crear a cerrar", "from created to closed");
    case "verifications":
      return verifications.count === 1
        ? t("1 verificación de tarea", "1 task verification")
        : t(
            `${count(verifications.count)} verificaciones de tarea`,
            `${count(verifications.count)} task verifications`,
          );
    case "cost":
      return t(
        `en ${count(cost.measured)} de ${count(cost.of)} ${cost.of === 1 ? "cambio cerrado" : "cambios cerrados"}`,
        `in ${count(cost.measured)} of ${count(cost.of)} closed ${cost.of === 1 ? "change" : "changes"}`,
      );
    case "pending":
      return t("en la memoria", "in the memory");
    default:
      return undefined;
  }
}

/**
 * How `figure` changed against the `days` before: none with «Todo» or without a value; «sin
 * datos» when those days have none; else ▲ or ▼ with the %, good when it went the right way.
 */
function deltaOf(
  figure: StatsFigure,
  upIsGood: boolean,
  days: number | undefined,
  t: Translate,
  lang: Lang,
): StatDelta | undefined {
  const { change } = figure;
  if (days === undefined || change === undefined || figure.value === null) return undefined;
  const before = t(`los ${days} días anteriores`, `the previous ${days} days`);
  if (change === null)
    return { tone: "none", text: t(`sin datos en ${before}`, `no data in ${before}`) };
  if (Math.round(change * 100) === 0)
    return { tone: "none", text: t(`sin cambios frente a ${before}`, `no change vs. ${before}`) };
  const up = change > 0;
  return {
    tone: up === upIsGood ? "good" : "bad",
    mark: `${up ? "▲" : "▼"} ${percent(Math.abs(change), lang, 0)}`,
    text: t(`frente a ${before}`, `vs. ${before}`),
  };
}
