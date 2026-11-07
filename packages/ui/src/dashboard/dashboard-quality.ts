// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, computed, inject, input } from "@angular/core";
import { RouterLink } from "@angular/router";
import type { StatsView } from "@baquia-dev/specty-core";
import { LucideDynamicIcon } from "@lucide/angular";
import { LineChart } from "../components/charts/line-chart";
import { SectionDivider } from "../components/document";
import { LucideCircleX } from "../components/icons";
import { ShownText } from "../components/shown-text";
import { Preferences } from "../theme/preferences";
import { percent, shortDay } from "./dashboard-format";

type Quality = NonNullable<StatsView["quality"]>;

/** Below this share of passing verifications, the axis starts at 0 %; above, at it. */
const FLOOR = 0.8;

/**
 * «Calidad», in the «Panel» (docs/ui.md): the share of task verifications that pass per day or
 * week, the full verifications that failed, the contract tests, what the tasks left, and the
 * changes with most task verifications failed, each linked to its change.
 */
@Component({
  selector: "sp-dashboard-quality",
  imports: [LineChart, LucideDynamicIcon, RouterLink, SectionDivider, ShownText],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: "flex flex-col gap-4",
    role: "region",
    "aria-labelledby": "dashboard-quality",
    "data-section": "quality",
  },
  template: `
    <sp-section-divider [heading]="t()('Calidad', 'Quality')" headingId="dashboard-quality" [level]="2" />
    <div class="grid gap-x-10 gap-y-8 pl-6 lg:grid-cols-2">
      <sp-line-chart data-chart="verifications" [heading]="texts().heading" [category]="texts().category" [labels]="labels()" [values]="passing()" [label]="t()('Pasan', 'Passing')" [format]="percent()" [min]="floor()" [max]="1" />
      <div class="flex min-w-0 flex-col gap-4">
        <h3 class="m-0 text-sm font-semibold">{{ t()('Señales de calidad', 'Quality signals') }}</h3>
        <div class="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-4">
          @for (figure of figures(); track figure.id) {
            <div class="flex min-w-0 flex-col gap-0.5" [attr.data-figure]="figure.id">
              <span class="text-xs text-text-muted" data-label>{{ figure.label }}</span>
              <span class="text-xl leading-tight font-semibold tabular-nums" data-value>{{ figure.value }}</span>
              <span class="text-xs text-text-muted" data-note>{{ figure.note }}</span>
            </div>
          }
        </div>
        <h4 class="m-0 mt-2 text-[13px] font-semibold">{{ t()('Cambios con más verificaciones fallidas', 'Changes with most failed verifications') }}</h4>
        @if (worst().length === 0) {
          <p class="m-0 text-sm text-text-muted" data-worst-none>{{ t()('Ninguna verificación de tarea falló en el periodo.', 'No task verification failed in the period.') }}</p>
        } @else {
          <table class="w-full border-collapse text-[13px]" data-worst>
            <thead>
              <tr>
                <th scope="col" class="border-b border-border px-2 py-1.5 text-left text-xs font-semibold text-text-muted">{{ t()('Cambio', 'Change') }}</th>
                <th scope="col" class="border-b border-border px-2 py-1.5 text-right text-xs font-semibold text-text-muted">{{ t()('Fallidas', 'Failed') }}</th>
              </tr>
            </thead>
            <tbody>
              @for (row of worst(); track row.id) {
                <tr [attr.data-change]="row.id">
                  <td class="max-w-0 px-2 py-1">
                    @if (row.title === undefined) {
                      <a class="block truncate font-mono text-xs text-text" [routerLink]="['/changes', row.id]" [attr.title]="row.id">{{ row.id }}</a>
                    } @else {
                      <a class="font-semibold text-text no-underline hover:underline" [routerLink]="['/changes', row.id]"><sp-text [text]="row.title" /></a>
                      <span class="block truncate font-mono text-[11px] text-text-muted" data-id [attr.title]="row.id">{{ row.id }}</span>
                    }
                  </td>
                  <td class="px-2 py-1 text-right whitespace-nowrap">
                    <span class="inline-flex items-center gap-1 text-phase-cancelled tabular-nums" data-failed><svg [lucideIcon]="failedIcon" size="12" aria-hidden="true"></svg>{{ row.text }}</span>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
    </div>
  `,
})
export class DashboardQuality {
  private readonly preferences = inject(Preferences);

  readonly quality = input.required<Quality>();

  protected readonly t = this.preferences.t;
  protected readonly failedIcon = LucideCircleX;

  protected readonly texts = computed(() => {
    const t = this.t();
    return this.quality().unit === "week"
      ? {
          heading: t(
            "Verificaciones de tarea que pasan, por semana",
            "Task verifications passing, per week",
          ),
          category: t("Semana del", "Week of"),
        }
      : {
          heading: t(
            "Verificaciones de tarea que pasan, por día",
            "Task verifications passing, per day",
          ),
          category: t("Día", "Day"),
        };
  });

  /** Each day, or the Monday of each week, as «9 oct». */
  protected readonly labels = computed(() => {
    const lang = this.preferences.lang();
    return this.quality().buckets.map((bucket) => shortDay(bucket.from, lang));
  });

  /** The share that passed of each day or week; none where there was no verification. */
  protected readonly passing = computed(() =>
    this.quality().buckets.map(({ passed, total }) => (total === 0 ? null : passed / total)),
  );

  /** The axis starts at 80 % when every share is above it, so a small drop shows. */
  protected readonly floor = computed(() => {
    const present = this.passing().filter((value) => value !== null);
    return present.length > 0 && Math.min(...present) >= FLOOR ? FLOOR : 0;
  });

  protected readonly percent = computed(() => {
    const lang = this.preferences.lang();
    return (value: number) => percent(value, lang, 1);
  });

  protected readonly figures = computed(() => {
    const t = this.t();
    const numbers = new Intl.NumberFormat(this.preferences.lang());
    const count = (value: number) => numbers.format(value);
    const { full, tests, risks, longFiles, removedAssertions } = this.quality();
    return [
      {
        id: "full",
        label: t("Verificación completa fallida", "Full verification failed"),
        value: t(
          `${count(full.failed)} de ${count(full.total)}`,
          `${count(full.failed)} of ${count(full.total)}`,
        ),
        note: t("al aceptar o incorporar main", "on accepting or merging main"),
      },
      {
        id: "tests",
        label: t("Tests de contrato", "Contract tests"),
        value: count(tests.proposed),
        note: t(
          `${count(tests.locked)} bloqueados en rojo (bug)`,
          `${count(tests.locked)} locked red (bug)`,
        ),
      },
      {
        id: "risks",
        label: t("Riesgos detectados", "Risks found"),
        value: count(risks),
        note: t("hallazgos en los diffs de las tareas", "findings in the tasks' diffs"),
      },
      {
        id: "long",
        label: t("Archivos largos", "Long files"),
        value: count(longFiles),
        note: t("por encima de lines.warn", "over lines.warn"),
      },
      {
        id: "assertions",
        label: t("Aserciones quitadas", "Assertions removed"),
        value: count(removedAssertions),
        note: t("de tests que ya existían", "from tests that already existed"),
      },
    ];
  });

  /** The changes that failed the most: «3 de 5». */
  protected readonly worst = computed(() => {
    const t = this.t();
    return this.quality().worst.map(({ id, title, failed, total }) => ({
      id,
      title,
      text: t(`${failed} de ${total}`, `${failed} of ${total}`),
    }));
  });
}
