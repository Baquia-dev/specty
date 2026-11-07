// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, computed, inject, input } from "@angular/core";
import type { StatsView } from "@baquia-dev/specty-core";
import { type ChartPart, SegmentedBar } from "../components/charts/segmented-bar";
import { SectionDivider } from "../components/document";
import { Preferences } from "../theme/preferences";

type Scope = NonNullable<StatsView["scope"]>;

/**
 * «Alcance e integraciones», in the «Panel» (docs/ui.md): how far the work of the period went out
 * of its plan and what merging main took: the scope requests decided, by decision, the merges of
 * main that stopped, by reason, and the adjustments asked for, with on how many changes.
 */
@Component({
  selector: "sp-dashboard-scope",
  imports: [SectionDivider, SegmentedBar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: "flex flex-col gap-4",
    role: "region",
    "aria-labelledby": "dashboard-scope",
    "data-section": "scope",
  },
  template: `
    <sp-section-divider [heading]="t()('Alcance e integraciones', 'Scope and integrations')" headingId="dashboard-scope" [level]="2" />
    <div class="grid gap-x-10 gap-y-8 pl-6 lg:grid-cols-3">
      <div class="flex min-w-0 flex-col gap-1">
        <sp-segmented-bar data-chart="requests" [heading]="t()('Solicitudes de alcance', 'Scope requests')" [category]="t()('Decisión', 'Decision')" [label]="t()('Solicitudes', 'Requests')" [parts]="requests()" />
        <p class="m-0 text-xs text-text-muted" data-note="requests">{{ notes().requests }}</p>
      </div>
      <div class="flex min-w-0 flex-col gap-1">
        <sp-segmented-bar data-chart="integrations" [heading]="t()('Incorporaciones de main que pararon', 'Merges of main that stopped')" [category]="t()('Motivo', 'Reason')" [label]="t()('Incorporaciones', 'Merges')" [parts]="integrations()" />
        <p class="m-0 text-xs text-text-muted" data-note="integrations">{{ notes().integrations }}</p>
      </div>
      <div class="flex min-w-0 flex-col gap-0.5" data-figure="adjustments">
        <span class="text-xs text-text-muted" data-label>{{ t()('Ajustes pedidos', 'Adjustments requested') }}</span>
        <span class="text-xl leading-tight font-semibold tabular-nums" data-value>{{ notes().adjustments }}</span>
        <span class="text-xs text-text-muted" data-note>{{ notes().adjusted }}</span>
      </div>
    </div>
  `,
})
export class DashboardScope {
  private readonly preferences = inject(Preferences);

  readonly scope = input.required<Scope>();

  protected readonly t = this.preferences.t;

  protected readonly requests = computed((): readonly ChartPart[] => {
    const t = this.t();
    const { auto, approved, rejected } = this.scope().requests;
    return [
      { label: t("Automáticas", "Automatic"), color: "--color-series-1", value: auto },
      { label: t("Aprobadas", "Approved"), color: "--color-series-2", value: approved },
      { label: t("Rechazadas", "Rejected"), color: "--color-series-3", value: rejected },
    ];
  });

  protected readonly integrations = computed((): readonly ChartPart[] => {
    const t = this.t();
    const { verify, conflicts } = this.scope().integrations;
    return [
      {
        label: t("La verificación falló", "Verification failed"),
        color: "--color-series-1",
        value: verify,
      },
      { label: t("Conflictos", "Conflicts"), color: "--color-series-2", value: conflicts },
    ];
  });

  /** «169 decididas», «118 en 80 cambios» and the adjustments, «44» «en 30 cambios». */
  protected readonly notes = computed(() => {
    const t = this.t();
    const numbers = new Intl.NumberFormat(this.preferences.lang());
    const count = (value: number) => numbers.format(value);
    const { requests, integrations, adjustments } = this.scope();
    const onChanges = (changes: number) =>
      changes === 1
        ? t(`en ${count(changes)} cambio`, `on ${count(changes)} change`)
        : t(`en ${count(changes)} cambios`, `on ${count(changes)} changes`);
    const decided = requests.auto + requests.approved + requests.rejected;
    return {
      requests:
        decided === 1
          ? t("1 decidida", "1 decided")
          : t(`${count(decided)} decididas`, `${count(decided)} decided`),
      integrations: `${count(integrations.verify + integrations.conflicts)} ${onChanges(integrations.changes)}`,
      adjustments: count(adjustments.requested),
      adjusted: onChanges(adjustments.changes),
    };
  });
}
