// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, computed, inject, input } from "@angular/core";
import { RouterLink } from "@angular/router";
import type { ChangeKind, StatsView } from "@baquia-dev/specty-core";
import type { Lang } from "@baquia-dev/specty-core/light";
import { KindBadge } from "../components/badge";
import { BarList, type BarRow } from "../components/charts/bar-list";
import { type ChartSeries, ColumnChart } from "../components/charts/column-chart";
import { type ChartPart, SegmentedBar } from "../components/charts/segmented-bar";
import { SectionDivider } from "../components/document";
import { formatDuration } from "../data/progress";
import { Preferences } from "../theme/preferences";

type Cost = NonNullable<StatsView["cost"]>;

/** The lanes, by the names of the Inbox's badges (`components/badge.ts`). */
const LANES: Readonly<Record<ChangeKind, { readonly es: string; readonly en: string }>> = {
  standard: { es: "Feature", en: "Feature" },
  quick: { es: "Quick", en: "Quick" },
  epic: { es: "Épica", en: "Epic" },
  spike: { es: "Spike", en: "Spike" },
  retro: { es: "Manual", en: "Manual" },
};

const HEAD = "border-b border-border px-2 py-1.5 text-xs font-semibold text-text-muted";
const FIGURE = "px-2 py-1 text-right whitespace-nowrap tabular-nums";

/**
 * «Coste y tokens», in the «Panel» (docs/ui.md): what the changes of the period cost, as ccusage
 * measured it on closing them: per day or week in columns, the tokens by type, the cost by lane
 * and the costliest changes, each linked to its change, and on how many changes it was measured.
 */
@Component({
  selector: "sp-dashboard-cost",
  imports: [BarList, ColumnChart, KindBadge, RouterLink, SectionDivider, SegmentedBar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: "flex flex-col gap-4",
    role: "region",
    "aria-labelledby": "dashboard-cost",
    "data-section": "cost",
  },
  template: `
    <sp-section-divider [heading]="t()('Coste y tokens', 'Cost and tokens')" headingId="dashboard-cost" [level]="2" />
    <p class="m-0 pl-6 text-sm text-text-muted" data-measured>{{ measuredLine() }}</p>
    @if (cost().tokens.changes === 0) {
      <p class="m-0 pl-6 text-sm text-text-muted" data-cost-none>{{ t()('Ningún cambio del periodo tiene su consumo medido.', 'No change of the period has its usage measured.') }}</p>
    } @else {
      <div class="grid gap-x-10 gap-y-8 pl-6 lg:grid-cols-2">
        <sp-column-chart data-chart="cost" [heading]="texts().heading" [category]="texts().category" [labels]="labels()" [series]="series()" />
        <div class="flex min-w-0 flex-col gap-6">
          <div class="flex min-w-0 flex-col gap-1">
            <sp-segmented-bar data-chart="tokens" [heading]="t()('Tokens por tipo', 'Tokens by type')" [category]="t()('Tipo', 'Type')" label="Tokens" [parts]="tokens()" [format]="compact()" />
            <p class="m-0 text-xs text-text-muted" data-calls>{{ callsLine() }}</p>
          </div>
          @if (lanes().length > 0) {
            <sp-bar-list data-chart="lanes" [heading]="t()('Coste por carril', 'Cost by lane')" [category]="t()('Carril', 'Lane')" [label]="t()('Coste', 'Cost')" [detailLabel]="t()('Cambios', 'Changes')" [rows]="lanes()" />
          }
        </div>
      </div>
      <div class="flex min-w-0 flex-col gap-2 pl-6">
        <h3 class="m-0 text-sm font-semibold" data-top-heading>{{ t()('Los cambios más caros', 'The costliest changes') }}</h3>
        @if (top().length === 0) {
          <p class="m-0 text-sm text-text-muted" data-top-none>{{ t()('Ningún cambio del periodo tiene el coste medido.', 'No change of the period has its cost measured.') }}</p>
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full border-collapse text-[13px]" data-top>
              <thead>
                <tr>
                  @for (column of columns(); track column.id) {
                    <th scope="col" [class]="HEAD + (column.figure ? ' text-right' : ' text-left')">{{ column.label }}</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (row of top(); track row.id) {
                  <tr [attr.data-change]="row.id">
                    <td data-cell="change" class="max-w-0 truncate px-2 py-1"><a class="font-mono text-xs text-text" [routerLink]="['/changes', row.id]" [attr.title]="row.id">{{ row.id }}</a></td>
                    <td data-cell="kind" class="px-2 py-1"><sp-kind-badge [kind]="row.kind" /></td>
                    <td data-cell="tasks" [class]="FIGURE">{{ row.tasks }}</td>
                    <td data-cell="cycle" [class]="FIGURE">{{ row.cycle }}</td>
                    <td data-cell="sessions" [class]="FIGURE">{{ row.sessions }}</td>
                    <td data-cell="cost" [class]="FIGURE">{{ row.cost }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    }
  `,
})
export class DashboardCost {
  private readonly preferences = inject(Preferences);

  readonly cost = input.required<Cost>();
  /** The «Coste medido» figure: the changes with a cost in the period, of those closed in it. */
  readonly measured = input.required<{ readonly measured: number; readonly of: number }>();

  protected readonly t = this.preferences.t;
  protected readonly HEAD = HEAD;
  protected readonly FIGURE = FIGURE;

  private readonly formats = computed(() => {
    const lang = this.preferences.lang();
    return {
      count: new Intl.NumberFormat(lang),
      usd: new Intl.NumberFormat(lang, { style: "currency", currency: "USD" }),
      compact: new Intl.NumberFormat(lang, { notation: "compact", maximumFractionDigits: 1 }),
    };
  });

  /** «coste en 35 de 40 cambios cerrados», as the figure says it. */
  protected readonly measuredLine = computed(() => {
    const t = this.t();
    const { count } = this.formats();
    const { measured, of } = this.measured();
    const [some, all] = [count.format(measured), count.format(of)];
    return of === 1
      ? t(
          `Medido con ccusage al cerrar cada cambio: coste en ${some} de ${all} cambio cerrado.`,
          `Measured with ccusage on closing each change: cost in ${some} of ${all} closed change.`,
        )
      : t(
          `Medido con ccusage al cerrar cada cambio: coste en ${some} de ${all} cambios cerrados.`,
          `Measured with ccusage on closing each change: cost in ${some} of ${all} closed changes.`,
        );
  });

  protected readonly texts = computed(() => {
    const t = this.t();
    return this.cost().unit === "week"
      ? {
          heading: t("Coste por semana (USD)", "Cost per week (USD)"),
          category: t("Semana del", "Week of"),
        }
      : { heading: t("Coste por día (USD)", "Cost per day (USD)"), category: t("Día", "Day") };
  });

  /** Each day, or the Monday of each week, as «9 oct». */
  protected readonly labels = computed(() => {
    const lang = this.preferences.lang();
    return this.cost().buckets.map((bucket) => shortDay(bucket.from, lang));
  });

  /** The cost of each day or week, to the cent. */
  protected readonly series = computed((): readonly ChartSeries[] => [
    {
      label: "USD",
      color: "--color-series-1",
      values: this.cost().buckets.map((bucket) => Math.round(bucket.cost * 100) / 100),
    },
  ]);

  /** The cache read, the cache written and the output: the palette has three colors. */
  protected readonly tokens = computed((): readonly ChartPart[] => {
    const t = this.t();
    const { cacheRead, cacheWrite, output } = this.cost().tokens;
    return [
      { label: t("Lectura de caché", "Cache read"), color: "--color-series-1", value: cacheRead },
      {
        label: t("Escritura de caché", "Cache write"),
        color: "--color-series-2",
        value: cacheWrite,
      },
      { label: t("Salida", "Output"), color: "--color-series-3", value: output },
    ];
  });

  protected readonly compact = computed(() => {
    const { compact } = this.formats();
    return (value: number) => compact.format(value);
  });

  /** The calls to the model, on how many changes, and the input tokens out of the cache. */
  protected readonly callsLine = computed(() => {
    const t = this.t();
    const { count, compact } = this.formats();
    const { calls, changes, input } = this.cost().tokens;
    const [made, on, read] = [count.format(calls), count.format(changes), compact.format(input)];
    return changes === 1
      ? t(
          `Llamadas al modelo: ${made}, en ${on} cambio. Tokens de entrada sin caché: ${read}.`,
          `Model calls: ${made}, in ${on} change. Uncached input tokens: ${read}.`,
        )
      : t(
          `Llamadas al modelo: ${made}, en ${on} cambios. Tokens de entrada sin caché: ${read}.`,
          `Model calls: ${made}, in ${on} changes. Uncached input tokens: ${read}.`,
        );
  });

  protected readonly lanes = computed((): readonly BarRow[] => {
    const t = this.t();
    const { count, usd } = this.formats();
    return this.cost().lanes.map(({ kind, cost, changes }) => ({
      label: t(LANES[kind].es, LANES[kind].en),
      value: cost,
      text: usd.format(cost),
      detail: count.format(changes),
    }));
  });

  protected readonly columns = computed(() => {
    const t = this.t();
    return [
      { id: "change", label: t("Cambio", "Change"), figure: false },
      { id: "kind", label: t("Carril", "Lane"), figure: false },
      { id: "tasks", label: t("Tareas", "Tasks"), figure: true },
      { id: "cycle", label: t("Ciclo", "Cycle"), figure: true },
      { id: "sessions", label: t("Sesiones", "Sessions"), figure: true },
      { id: "cost", label: t("Coste", "Cost"), figure: true },
    ];
  });

  /** The costliest changes, each figure as it reads. */
  protected readonly top = computed(() => {
    const lang = this.preferences.lang();
    const { count, usd } = this.formats();
    return this.cost().top.map((change) => ({
      id: change.id,
      kind: change.kind,
      tasks: count.format(change.tasks),
      cycle: change.cycle === null ? "—" : formatDuration(change.cycle, lang),
      sessions: count.format(change.sessions),
      cost: usd.format(change.cost),
    }));
  });
}

/** A local day, YYYY-MM-DD, as «9 oct» or «Oct 9». */
function shortDay(day: string, lang: Lang): string {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  return new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" }).format(
    new Date(year, month - 1, date),
  );
}
