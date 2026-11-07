// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, computed, inject, input } from "@angular/core";
import type { StatsView } from "@baquia-dev/specty-core";
import { BarList, type BarRow } from "../components/charts/bar-list";
import { type ChartPart, SegmentedBar } from "../components/charts/segmented-bar";
import { SectionDivider } from "../components/document";
import { formatDuration } from "../data/progress";
import { Preferences } from "../theme/preferences";

type Flow = NonNullable<StatsView["flow"]>;

/** The phases, by name, in the order of the flow. */
const PHASES: Readonly<
  Record<Flow["phases"][number]["phase"], { readonly es: string; readonly en: string }>
> = {
  spec: { es: "Redactar la spec", en: "Write the spec" },
  review: { es: "Revisión hasta aprobar", en: "Review until approved" },
  implementation: { es: "Implementación", en: "Implementation" },
  closing: { es: "Aceptación y cierre", en: "Acceptance and closing" },
};

/**
 * «Flujo y esperas», in the «Panel» (docs/ui.md): the median time of each phase of the changes
 * closed in the period, who approved the specs, how long the person waited, the proposals each
 * approval took and the agent sessions per change.
 */
@Component({
  selector: "sp-dashboard-flow",
  imports: [BarList, SectionDivider, SegmentedBar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: "flex flex-col gap-4",
    role: "region",
    "aria-labelledby": "dashboard-flow",
    "data-section": "flow",
  },
  template: `
    <sp-section-divider [heading]="t()('Flujo y esperas', 'Flow and waits')" headingId="dashboard-flow" [level]="2" />
    <div class="grid gap-x-10 gap-y-8 pl-6 lg:grid-cols-2">
      <div class="flex min-w-0 flex-col gap-2">
        <sp-bar-list data-chart="phases" [heading]="t()('Tiempo por fase (mediana por cambio)', 'Time per phase (median per change)')" [category]="t()('Fase', 'Phase')" [label]="t()('Mediana', 'Median')" [detailLabel]="t()('Cambios', 'Changes')" [rows]="phases()" />
        <p class="m-0 text-xs text-text-muted">{{ t()('La revisión incluye lo que la spec espera a la persona; en modo delegado aprueba el agente.', 'The review includes how long the spec waits for the person; in delegated mode the agent approves.') }}</p>
      </div>
      <div class="flex min-w-0 flex-col gap-6">
        <sp-segmented-bar data-chart="approvals" [heading]="t()('Quién aprueba la spec', 'Who approves the spec')" [category]="t()('Canal', 'Channel')" [label]="t()('Aprobaciones', 'Approvals')" [parts]="approvals()" />
        <div class="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-4">
          @for (figure of figures(); track figure.id) {
            <div class="flex min-w-0 flex-col gap-0.5" [attr.data-figure]="figure.id">
              <span class="text-xs text-text-muted" data-label>{{ figure.label }}</span>
              <span class="text-xl leading-tight font-semibold tabular-nums" data-value>{{ figure.value }}</span>
              <span class="text-xs text-text-muted" data-note>{{ figure.note }}</span>
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class DashboardFlow {
  private readonly preferences = inject(Preferences);

  readonly flow = input.required<Flow>();

  protected readonly t = this.preferences.t;

  protected readonly phases = computed((): readonly BarRow[] => {
    const t = this.t();
    const lang = this.preferences.lang();
    const numbers = new Intl.NumberFormat(lang);
    return this.flow().phases.map(({ phase, median, changes }) => ({
      label: t(PHASES[phase].es, PHASES[phase].en),
      value: median ?? 0,
      text: median === null ? "—" : formatDuration(median, lang),
      detail: numbers.format(changes),
    }));
  });

  protected readonly approvals = computed((): readonly ChartPart[] => {
    const t = this.t();
    const { delegated, tty, ui } = this.flow().approvals;
    return [
      {
        label: t("Delegado (el agente)", "Delegated (the agent)"),
        color: "--color-series-1",
        value: delegated,
      },
      { label: t("Terminal", "Terminal"), color: "--color-series-2", value: tty },
      { label: "UI", color: "--color-series-3", value: ui },
    ];
  });

  /** The wait for the person, the revisions per spec and the sessions per change. */
  protected readonly figures = computed(() => {
    const t = this.t();
    const lang = this.preferences.lang();
    const decimal = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
    const { wait, revisions, sessions } = this.flow();
    return [
      {
        id: "wait",
        label: t("Espera a la persona", "Wait for the person"),
        value: wait.median === null ? "—" : formatDuration(wait.median, lang),
        note:
          wait.approvals === 1
            ? t("mediana de 1 aprobación suya", "median of 1 of their approvals")
            : t(
                `mediana de ${wait.approvals} aprobaciones suyas`,
                `median of ${wait.approvals} of their approvals`,
              ),
      },
      {
        id: "revisions",
        label: t("Revisiones por spec", "Revisions per spec"),
        value: revisions === null ? "—" : decimal.format(revisions),
        note: t("propuestas por aprobación", "proposals per approval"),
      },
      {
        id: "sessions",
        label: t("Sesiones por cambio", "Sessions per change"),
        value: sessions.mean === null ? "—" : decimal.format(sessions.mean),
        note:
          sessions.changes === 1
            ? t("conversaciones de agente, en 1 cambio", "agent conversations, on 1 change")
            : t(
                `conversaciones de agente, en ${sessions.changes} cambios`,
                `agent conversations, on ${sessions.changes} changes`,
              ),
      },
    ];
  });
}
