// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core";
import type { BarRow } from "../components/charts/bar-list";
import { BarList } from "../components/charts/bar-list";
import { type ChartSeries, ColumnChart } from "../components/charts/column-chart";
import { LineChart } from "../components/charts/line-chart";
import { type ChartPart, SegmentedBar } from "../components/charts/segmented-bar";
import { type StatDelta, StatTile, type StatTrend } from "../components/charts/stat-tile";
import { formatDuration } from "../data/progress";
import { Preferences } from "../theme/preferences";

const MINUTE = 60_000;

/**
 * The panel's charts (docs/ui.md, «Panel»), each with sample data and its states: several series
 * and one, a gap, a value at 0 and no data at all.
 */
@Component({
  selector: "sp-catalog-charts",
  imports: [BarList, ColumnChart, LineChart, SegmentedBar, StatTile],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="mt-0 mb-2 text-xl font-semibold">{{ t()('Gráficas', 'Charts') }}</h1>
    <p class="mt-0 mb-8 max-w-[64ch] text-text-muted">
      {{
        t()(
          'Las gráficas del Panel: SVG propio con la paleta de las series, el texto en tinta, «Ver tabla» con los mismos datos y una sola parada del tabulador, cuyas marcas recorren las flechas.',
          'The Dashboard charts: plain SVG in the series palette, text in ink, «Show table» with the same data and one tab stop whose marks the arrows go through.'
        )
      }}
    </p>

    <section class="mb-10" aria-labelledby="chart-column">
      <h2 id="chart-column" class="mb-1 text-lg font-semibold">{{ t()('Columnas', 'Columns') }}</h2>
      <p class="mt-0 mb-4 max-w-[64ch] text-sm text-text-muted">{{ t()('Apiladas por serie, con leyenda; con una sola, el título la nombra.', 'Stacked by series, with a legend; with only one, the heading names it.') }}</p>
      <div class="grid gap-x-10 gap-y-8 rounded-xl border border-border bg-bg p-6 lg:grid-cols-2" data-example="column">
        <sp-column-chart [heading]="t()('Cambios cerrados por día, por carril', 'Changes closed per day, by lane')" [category]="t()('Día', 'Day')" [labels]="days()" [series]="lanes()" />
        <sp-column-chart [heading]="t()('Tareas completadas por día', 'Tasks completed per day')" [category]="t()('Día', 'Day')" [labels]="days()" [series]="tasks()" />
      </div>
    </section>

    <section class="mb-10" aria-labelledby="chart-line">
      <h2 id="chart-line" class="mb-1 text-lg font-semibold">{{ t()('Línea', 'Line') }}</h2>
      <p class="mt-0 mb-4 max-w-[64ch] text-sm text-text-muted">{{ t()('Una serie en el tiempo, con un hueco donde un día no tiene valor; sin ninguno, lo dice.', 'One series over time, with a gap where a day has no value; with none, it says so.') }}</p>
      <div class="grid gap-x-10 gap-y-8 rounded-xl border border-border bg-bg p-6 lg:grid-cols-2" data-example="line">
        <sp-line-chart [heading]="t()('Verificaciones de tarea que pasan, por día', 'Task verifications passing, per day')" [category]="t()('Día', 'Day')" [labels]="days()" [values]="passing" [label]="t()('Pasan', 'Passing')" [format]="percent()" [min]="0.8" [max]="1" />
        <sp-line-chart [heading]="t()('Sin datos', 'No data')" [category]="t()('Día', 'Day')" [labels]="days()" [values]="nothing" [label]="t()('Pasan', 'Passing')" [format]="percent()" />
      </div>
    </section>

    <section class="mb-10" aria-labelledby="chart-bars">
      <h2 id="chart-bars" class="mb-1 text-lg font-semibold">{{ t()('Barras horizontales', 'Horizontal bars') }}</h2>
      <p class="mt-0 mb-4 max-w-[64ch] text-sm text-text-muted">{{ t()('Una fila por elemento, en el orden dado, con su valor en el extremo; una sin medida conserva su fila.', 'A row per item, in the order given, with its value at the end; one with no measure keeps its row.') }}</p>
      <div class="rounded-xl border border-border bg-bg p-6" data-example="bars">
        <sp-bar-list [heading]="t()('Tiempo por fase (mediana por cambio)', 'Time per phase (median per change)')" [category]="t()('Fase', 'Phase')" [label]="t()('Mediana', 'Median')" [detailLabel]="t()('Cambios', 'Changes')" [rows]="phases()" />
      </div>
    </section>

    <section class="mb-10" aria-labelledby="chart-segmented">
      <h2 id="chart-segmented" class="mb-1 text-lg font-semibold">{{ t()('Barra segmentada', 'Segmented bar') }}</h2>
      <p class="mt-0 mb-4 max-w-[64ch] text-sm text-text-muted">{{ t()('Un todo en hasta tres partes, con su clave; una parte a 0 solo sale en la clave.', 'A whole in up to three parts, with its key; a part at 0 is only in the key.') }}</p>
      <div class="grid gap-x-10 gap-y-8 rounded-xl border border-border bg-bg p-6 lg:grid-cols-2" data-example="segmented">
        <sp-segmented-bar [heading]="t()('Quién aprueba la spec', 'Who approves the spec')" [category]="t()('Canal', 'Channel')" [label]="t()('Aprobaciones', 'Approvals')" [parts]="approvals()" />
        <sp-segmented-bar [heading]="t()('Sin datos', 'No data')" [category]="t()('Canal', 'Channel')" [label]="t()('Aprobaciones', 'Approvals')" [parts]="none()" />
      </div>
    </section>

    <section aria-labelledby="chart-stat-tile">
      <h2 id="chart-stat-tile" class="mb-1 text-lg font-semibold">{{ t()('Indicador con minigráfica', 'Figure with sparkline') }}</h2>
      <p class="mt-0 mb-4 max-w-[64ch] text-sm text-text-muted">{{ t()('Una cifra con su variación y, debajo, su valor en cada día: la línea se corta donde un día no tiene valor y marca el último; sin ninguno, no dibuja nada.', 'A figure with its change and, under them, its value in each day: the line breaks where a day has no value and marks the last one; with none, it draws nothing.') }}</p>
      <div class="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-6 rounded-xl border border-border bg-bg p-6" data-example="stat-tile">
        <sp-stat-tile [label]="t()('Cambios cerrados', 'Changes closed')" value="12" [delta]="better()" [trend]="closed()" />
        <sp-stat-tile [label]="t()('Ciclo (mediana)', 'Cycle (median)')" [value]="cycleValue()" [delta]="worse()" [note]="t()('de crear a cerrar', 'from created to closed')" [trend]="cycle()" />
        <sp-stat-tile [label]="t()('Coste medido', 'Measured cost')" value="—" [trend]="unmeasured()" />
        <sp-stat-tile [label]="t()('Pendientes abiertos', 'Open pending items')" value="7" [note]="t()('en la memoria', 'in the memory')" />
      </div>
    </section>
  `,
})
export class CatalogCharts {
  private readonly preferences = inject(Preferences);
  protected readonly t = this.preferences.t;

  /** 1 to 7 November 2026, as «3 nov» or «Nov 3». */
  protected readonly days = computed(() => {
    const format = new Intl.DateTimeFormat(this.preferences.lang(), {
      day: "numeric",
      month: "short",
    });
    return Array.from({ length: 7 }, (_, index) => format.format(new Date(2026, 10, index + 1)));
  });

  protected readonly lanes = computed((): readonly ChartSeries[] => {
    const t = this.t();
    return [
      { label: "Feature", color: "--color-series-1", values: [2, 0, 1, 3, 0, 1, 2] },
      { label: "Quick", color: "--color-series-2", values: [1, 0, 0, 2, 1, 0, 1] },
      {
        label: t("Épica, spike y manual", "Epic, spike and manual"),
        color: "--color-series-3",
        values: [0, 0, 1, 0, 0, 0, 1],
      },
    ];
  });

  protected readonly tasks = computed((): readonly ChartSeries[] => [
    {
      label: this.t()("Tareas", "Tasks"),
      color: "--color-series-1",
      values: [6, 0, 4, 9, 2, 3, 5],
    },
  ]);

  protected readonly passing: readonly (number | null)[] = [0.95, 1, null, 0.9, 0.97, null, 1];
  protected readonly nothing: readonly (number | null)[] = Array.from({ length: 7 }, () => null);

  protected readonly percent = computed(() => {
    const format = new Intl.NumberFormat(this.preferences.lang(), {
      style: "percent",
      maximumFractionDigits: 1,
    });
    return (value: number) => format.format(value);
  });

  protected readonly phases = computed((): readonly BarRow[] => {
    const t = this.t();
    const lang = this.preferences.lang();
    const row = (es: string, en: string, median: number | null, changes: number): BarRow => ({
      label: t(es, en),
      value: median ?? 0,
      text: median === null ? "—" : formatDuration(median, lang),
      detail: String(changes),
    });
    return [
      row("Redactar la spec", "Write the spec", 25 * MINUTE, 12),
      row("Revisión hasta aprobar", "Review until approved", 120 * MINUTE, 12),
      row("Implementación", "Implementation", 90 * MINUTE, 10),
      row("Aceptación y cierre", "Acceptance and closing", null, 0),
    ];
  });

  protected readonly approvals = computed((): readonly ChartPart[] => {
    const t = this.t();
    return [
      {
        label: t("Delegado (el agente)", "Delegated (the agent)"),
        color: "--color-series-1",
        value: 42,
      },
      { label: t("Terminal", "Terminal"), color: "--color-series-2", value: 7 },
      { label: "UI", color: "--color-series-3", value: 0 },
    ];
  });

  protected readonly none = computed((): readonly ChartPart[] =>
    this.approvals().map((part) => ({ ...part, value: 0 })),
  );

  /** A change for the better and one for the worse, against the 7 days before. */
  protected readonly better = computed(
    (): StatDelta => ({
      tone: "good",
      mark: "▲ 25 %",
      text: this.t()("frente a los 7 días anteriores", "vs. the previous 7 days"),
    }),
  );
  protected readonly worse = computed(
    (): StatDelta => ({ ...this.better(), tone: "bad", mark: "▲ 10 %" }),
  );

  protected readonly cycleValue = computed(() =>
    formatDuration(150 * MINUTE, this.preferences.lang()),
  );

  /** A trend of the catalog's days, read with `format`. */
  private trendOf(
    es: string,
    en: string,
    values: readonly (number | null)[],
    format: (value: number) => string,
  ): StatTrend {
    return { heading: this.t()(es, en), labels: this.days(), values, format };
  }

  protected readonly closed = computed(() =>
    this.trendOf(
      "Cambios cerrados por día",
      "Changes closed per day",
      [1, 0, 2, 3, 1, 2, 3],
      String,
    ),
  );

  /** Two days in a row, a value alone and the last one alone too. */
  protected readonly cycle = computed(() => {
    const lang = this.preferences.lang();
    const hours = [null, 2, 3, null, 1.5, null, 2.5];
    return this.trendOf(
      "Ciclo (mediana) por día",
      "Cycle (median) per day",
      hours.map((hour) => (hour === null ? null : hour * 60 * MINUTE)),
      (value) => formatDuration(value, lang),
    );
  });

  protected readonly unmeasured = computed(() =>
    this.trendOf(
      "Coste medido por día",
      "Measured cost per day",
      this.days().map(() => null),
      String,
    ),
  );
}
