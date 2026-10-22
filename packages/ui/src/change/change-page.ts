// SPDX-License-Identifier: Apache-2.0
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
} from "@angular/core";
import { Router, RouterLink } from "@angular/router";
import type { EffortLevel } from "@baquia-dev/specty-core";
import { LucideArrowLeft, LucideDynamicIcon, LucideTriangleAlert } from "@lucide/angular";
import { Badge, PhaseBadge } from "../components/badge";
import { Skeleton } from "../components/skeleton";
import { TabPanel, Tabs } from "../components/tabs";
import { ChangesStore } from "../data/changes-store";
import type { ChangeTab, DecisionKind } from "../data/records";
import { SpecReview } from "../review/spec-review";
import { Preferences } from "../theme/preferences";

const TABS: readonly ChangeTab[] = ["spec", "progress", "acceptance", "history"];

const EFFORT: Readonly<Record<EffortLevel, { es: string; en: string }>> = {
  low: { es: "bajo", en: "low" },
  medium: { es: "medio", en: "medium" },
  high: { es: "alto", en: "high" },
  max: { es: "máximo", en: "max" },
};

const WAITING: Readonly<Record<DecisionKind, { es: string; en: string }>> = {
  review: { es: "Espera tu revisión de la spec", en: "Waiting for your spec review" },
  scope: { es: "Espera tu decisión sobre el alcance", en: "Waiting for your scope decision" },
  acceptance: { es: "Espera que aceptes el resultado", en: "Waiting for you to accept the result" },
  closing: { es: "Espera que confirmes el cierre", en: "Waiting for you to confirm the closing" },
};

/** One change: its header and the tabs Spec · Progress · Acceptance · History, opened by phase. */
@Component({
  selector: "sp-change-page",
  imports: [RouterLink, LucideDynamicIcon, Badge, PhaseBadge, Skeleton, Tabs, TabPanel, SpecReview],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-6xl flex-col gap-6 px-6 pt-8">
      <a routerLink="/" class="flex items-center gap-1 self-start text-sm text-text-muted">
        <svg [lucideIcon]="back" size="14" aria-hidden="true"></svg>{{ t()('Bandeja', 'Inbox') }}
      </a>
      @if (change(); as change) {
        <header class="flex flex-col gap-3">
          <div class="flex flex-wrap items-center gap-2">
            <sp-phase-badge [phase]="change.phase" />
            <sp-badge>r{{ change.revision }}</sp-badge>
            @if (change.branch; as branch) {
              <code class="font-mono text-xs text-text-muted">{{ branch }}</code>
            }
          </div>
          <h1 class="m-0 text-xl font-semibold">{{ change.title }}</h1>
          <p class="m-0 flex flex-wrap items-center gap-2 text-sm text-text-muted">
            @if (change.size; as size) {
              <sp-badge>{{ size.level }}</sp-badge>
              {{ reasons() }}
            }
            @if (change.effort; as effort) {
              <span>
                · {{ t()('Esfuerzo recomendado', 'Recommended effort') }}:
                {{ t()('planificación', 'planning') }} {{ effortName(effort.plan) }} ·
                {{ t()('implementación', 'implementation') }} {{ effortName(effort.implement) }}
              </span>
            }
          </p>
          @if (change.decision; as decision) {
            <p class="m-0 text-sm font-medium" data-waiting>{{ t()(waiting[decision].es, waiting[decision].en) }}</p>
          }
          @for (problem of change.problems; track problem) {
            <p class="m-0 flex items-center gap-2 text-sm" role="note">
              <svg [lucideIcon]="warning" size="14" aria-hidden="true" style="color: var(--color-phase-review)"></svg>
              {{ problem }}
            </p>
          }
        </header>

        <sp-tabs [label]="t()('Secciones del cambio', 'Change sections')" [selected]="tab()" (selectedChange)="select($event)">
          <sp-tab-panel value="spec" label="Spec">
            <sp-spec-review [change]="change" />
          </sp-tab-panel>
          <sp-tab-panel value="progress" [label]="t()('Progreso', 'Progress')">
            <p class="mt-0">{{ change.tasks.done }}/{{ change.tasks.total }} {{ t()('tareas hechas', 'tasks done') }}</p>
            @for (request of change.scopeRequests; track request.id) {
              <p class="m-0 text-sm">{{ request.id }} · {{ request.task }} {{ t()('pide', 'asks for') }} <code class="font-mono text-xs">{{ request.paths.join(', ') }}</code>: «{{ request.reason }}»</p>
            }
            <p class="mb-0 text-sm text-text-muted">{{ t()('La línea de tiempo de tareas llega en un próximo cambio del prototipo.', 'The task timeline comes in a later prototype change.') }}</p>
          </sp-tab-panel>
          <sp-tab-panel value="acceptance" [label]="t()('Aceptación', 'Acceptance')">
            <p class="m-0 text-sm text-text-muted">{{ t()('Criterios con evidencia, diffs y cierre llegan en un próximo cambio del prototipo.', 'Criteria with evidence, diffs and closing come in a later prototype change.') }}</p>
          </sp-tab-panel>
          <sp-tab-panel value="history" [label]="t()('Historial', 'History')">
            <p class="m-0 text-sm text-text-muted">{{ t()('El historial y la trazabilidad llegan en la fase 3.', 'History and traceability come in phase 3.') }}</p>
          </sp-tab-panel>
        </sp-tabs>
      } @else if (store.views.hasValue()) {
        <section class="flex flex-col items-start gap-3 rounded-xl border border-border bg-surface p-6" role="status">
          <h1 class="m-0 text-lg font-semibold">{{ t()('No existe ese cambio', 'That change does not exist') }}</h1>
          <p class="m-0 text-sm text-text-muted">
            <code class="font-mono">{{ id() }}</code>
            {{ t()('no está entre los cambios del proyecto.', 'is not among the changes of the project.') }}
          </p>
          <a routerLink="/">{{ t()('Volver a la Bandeja', 'Back to the Inbox') }}</a>
        </section>
      } @else {
        <sp-skeleton height="2rem" width="60%" />
        <sp-skeleton height="12rem" [announce]="false" />
      }
    </div>
  `,
})
export class ChangePage {
  /** From the route: `/changes/:id?tab=…`. */
  readonly id = input.required<string>();
  readonly tabParam = input<string | undefined>(undefined, { alias: "tab" });

  protected readonly store = inject(ChangesStore);
  private readonly preferences = inject(Preferences);
  private readonly router = inject(Router);
  protected readonly t = this.preferences.t;
  protected readonly back = LucideArrowLeft;
  protected readonly warning = LucideTriangleAlert;
  protected readonly waiting = WAITING;
  protected readonly change = this.store.byId(this.id);

  /** The tab in the URL if valid; otherwise, the one for the change's phase. */
  protected readonly tab = linkedSignal<ChangeTab>(() => {
    const asked = TABS.find((tab) => tab === this.tabParam());
    return asked ?? this.change()?.tab ?? "spec";
  });

  protected readonly reasons = computed(() => {
    const lang = this.preferences.lang();
    return (this.change()?.size?.reasons ?? []).map((reason) => reason[lang]).join(" · ");
  });

  protected effortName(level: EffortLevel): string {
    return EFFORT[level][this.preferences.lang()];
  }

  protected select(value: string | undefined): void {
    const tab = TABS.find((candidate) => candidate === value);
    if (tab === undefined) return;
    this.tab.set(tab);
    void this.router.navigate([], { queryParams: { tab }, replaceUrl: true });
  }
}
