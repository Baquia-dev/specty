// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, computed, inject, input } from "@angular/core";
import type { ChangeKind, StatsView } from "@baquia-dev/specty-core";
import type { Lang } from "@baquia-dev/specty-core/light";
import { type ChartSeries, ColumnChart } from "../components/charts/column-chart";
import { SectionDivider } from "../components/document";
import { Preferences } from "../theme/preferences";

/**
 * The lanes the closed changes stack in: one per color of the palette, so epics, spikes and
 * manual changes share the third. A lane chosen leaves only its own, in the same color.
 */
const GROUPS: readonly {
  readonly kinds: readonly ChangeKind[];
  readonly color: ChartSeries["color"];
  readonly es: string;
  readonly en: string;
}[] = [
  { kinds: ["standard"], color: "--color-series-1", es: "Feature", en: "Feature" },
  { kinds: ["quick"], color: "--color-series-2", es: "Quick", en: "Quick" },
  {
    kinds: ["epic", "spike", "retro"],
    color: "--color-series-3",
    es: "Épica, spike y manual",
    en: "Epic, spike and manual",
  },
];

/**
 * «Ritmo», in the «Panel» (docs/ui.md): the changes of the cut closed per day, stacked by lane,
 * and the tasks completed, or per week in a period of more than 45 days.
 */
@Component({
  selector: "sp-dashboard-rhythm",
  imports: [ColumnChart, SectionDivider],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: "flex flex-col gap-4",
    role: "region",
    "aria-labelledby": "dashboard-rhythm",
    "data-section": "rhythm",
  },
  template: `
    <sp-section-divider [heading]="t()('Ritmo', 'Rhythm')" headingId="dashboard-rhythm" [level]="2" />
    <div class="grid gap-x-10 gap-y-8 pl-6 lg:grid-cols-2">
      <sp-column-chart data-chart="closed" [heading]="texts().closed" [category]="texts().category" [labels]="labels()" [series]="closed()" />
      <sp-column-chart data-chart="tasks" [heading]="texts().tasks" [category]="texts().category" [labels]="labels()" [series]="tasks()" />
    </div>
  `,
})
export class DashboardRhythm {
  private readonly preferences = inject(Preferences);

  readonly rhythm = input.required<NonNullable<StatsView["rhythm"]>>();
  /** The lane chosen, if there is one. */
  readonly kind = input<ChangeKind>();

  protected readonly t = this.preferences.t;

  protected readonly texts = computed(() => {
    const t = this.t();
    return this.rhythm().unit === "week"
      ? {
          closed: t("Cambios cerrados por semana, por carril", "Changes closed per week, by lane"),
          tasks: t("Tareas completadas por semana", "Tasks completed per week"),
          category: t("Semana del", "Week of"),
        }
      : {
          closed: t("Cambios cerrados por día, por carril", "Changes closed per day, by lane"),
          tasks: t("Tareas completadas por día", "Tasks completed per day"),
          category: t("Día", "Day"),
        };
  });

  /** Each day, or the Monday of each week, as «9 oct». */
  protected readonly labels = computed(() => {
    const lang = this.preferences.lang();
    return this.rhythm().buckets.map((bucket) => shortDay(bucket.from, lang));
  });

  protected readonly closed = computed((): readonly ChartSeries[] => {
    const t = this.t();
    const kind = this.kind();
    const buckets = this.rhythm().buckets;
    return GROUPS.filter((group) => kind === undefined || group.kinds.includes(kind)).map(
      (group) => ({
        label: t(group.es, group.en),
        color: group.color,
        values: buckets.map((bucket) =>
          group.kinds.reduce((all, one) => all + bucket.closed[one], 0),
        ),
      }),
    );
  });

  protected readonly tasks = computed((): readonly ChartSeries[] => [
    {
      label: this.t()("Tareas", "Tasks"),
      color: "--color-series-1",
      values: this.rhythm().buckets.map((bucket) => bucket.tasks),
    },
  ]);
}

/** A local day, YYYY-MM-DD, as «9 oct» or «Oct 9». */
function shortDay(day: string, lang: Lang): string {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  return new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" }).format(
    new Date(year, month - 1, date),
  );
}
