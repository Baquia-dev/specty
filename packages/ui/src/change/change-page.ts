// SPDX-License-Identifier: Apache-2.0
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
  viewChild,
} from "@angular/core";
import { Router, RouterLink } from "@angular/router";
import type { EffortLevel } from "@baquia-dev/specty-core";
import { LucideArrowLeft, LucideDynamicIcon, LucideTriangleAlert } from "@lucide/angular";
import { PhaseBadge } from "../components/badge";
import { Skeleton } from "../components/skeleton";
import { TabPanel, Tabs } from "../components/tabs";
import { ChangesStore } from "../data/changes-store";
import {
  type ChangeTab,
  type DecisionKind,
  type ReviewSection,
  relativeTime,
} from "../data/records";
import { SECTION_LABELS } from "../review/comments";
import { sectionNumber } from "../review/section-meta";
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

/** The compact bar slides in once the wide header is out of view; hidden, it is inert. */
const BAR =
  "absolute inset-x-0 top-0 border-b border-border bg-bg/90 backdrop-blur transition-[translate,opacity] duration-200 ease-out motion-reduce:transition-none";
const BAR_SHOWN = `${BAR} translate-y-0 opacity-100`;
const BAR_HIDDEN = `${BAR} pointer-events-none -translate-y-full opacity-0`;

/** A fact of the wide header: a small-caps label over its value, split by hairlines. */
const FACT =
  "flex min-w-0 flex-col gap-1 border-l border-border px-5 py-3.5 first:border-l-0 first:pl-0";
const FACT_LABEL = "text-[11px] tracking-[0.1em] text-text-muted uppercase";

/** One change: a wide header, a compact bar while scrolling, and the tabs Spec · Progress · Acceptance · History. */
@Component({
  selector: "sp-change-page",
  imports: [RouterLink, LucideDynamicIcon, PhaseBadge, Skeleton, Tabs, TabPanel, SpecReview],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col pb-16">
      @if (change(); as change) {
        <!-- Zero height in the flow: the bar never pushes the content. -->
        <div class="sticky top-0 z-20 h-0">
          <div #bar [class]="compact() ? barShown : barHidden" [attr.inert]="compact() ? null : ''" data-sticky>
            <div class="mx-auto flex h-14 max-w-6xl items-center gap-3 px-6">
              <sp-phase-badge [phase]="change.phase" />
              <p class="m-0 min-w-0 truncate text-[15px] font-semibold tracking-tight">{{ change.title }}</p>
              <span class="font-mono text-xs text-text-muted">r{{ change.revision }}</span>
              @if (tab() === 'spec' && readingLabel(); as section) {
                <span class="h-4 w-px shrink-0 bg-border" aria-hidden="true"></span>
                <span class="font-mono text-xs whitespace-nowrap text-text-muted" data-reading>§ {{ section }}</span>
              }
              <span class="ml-auto shrink-0 text-sm whitespace-nowrap text-text-muted" data-summary>
                @if (highImpact(); as high) {
                  {{ t()('Supuestos', 'Assumptions') }} <span class="font-medium text-text">{{ high.decided }}/{{ high.total }}</span> ·
                }
                {{ t()('Comentarios', 'Comments') }} <span class="font-medium text-text">{{ openComments() }}</span>
              </span>
            </div>
          </div>
        </div>

        <header #hero class="mx-auto flex w-full max-w-6xl flex-col px-6 pt-8" data-hero>
          <p class="m-0 flex items-center gap-2 text-sm text-text-muted">
            <a routerLink="/" class="flex items-center gap-1 text-text-muted">
              <svg [lucideIcon]="back" size="14" aria-hidden="true"></svg>{{ t()('Bandeja', 'Inbox') }}
            </a>
            <span aria-hidden="true">/</span>
            <span class="min-w-0 truncate font-mono text-xs">{{ change.id }}</span>
          </p>
          <div class="mt-6 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <sp-phase-badge [phase]="change.phase" />
            @if (change.decision; as decision) {
              <span class="text-sm text-text-muted" data-waiting>{{ t()(waiting[decision].es, waiting[decision].en) }}</span>
              <span class="text-sm text-text-muted" aria-hidden="true">·</span>
            }
            <span class="text-sm text-text-muted" data-since>{{ since(change.phaseSince) }}</span>
          </div>
          <h1 class="mt-3 mb-0 max-w-4xl text-[2.375rem] leading-[1.15] font-semibold tracking-[-0.028em]">{{ change.title }}</h1>
          <dl class="mt-8 mb-0 grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] border-t border-border">
            <div [class]="fact">
              <dt [class]="factLabel">{{ t()('Revisión', 'Revision') }}</dt>
              <dd class="m-0 font-mono text-sm">r{{ change.revision }}</dd>
            </div>
            @if (change.branch; as branch) {
              <div [class]="fact">
                <dt [class]="factLabel">{{ t()('Rama', 'Branch') }}</dt>
                <dd class="m-0 truncate font-mono text-[13px]" [title]="branch">{{ branch }}</dd>
              </div>
            }
            @if (change.size; as size) {
              <div [class]="fact">
                <dt [class]="factLabel">{{ t()('Tamaño', 'Size') }}</dt>
                <dd class="m-0 text-sm">{{ size.level }} · {{ reasons() }}</dd>
              </div>
            }
            @if (change.effort; as effort) {
              <div [class]="fact">
                <dt [class]="factLabel">{{ t()('Esfuerzo recomendado', 'Recommended effort') }}</dt>
                <dd class="m-0 text-sm">
                  {{ t()('Planificación', 'Planning') }} {{ effortName(effort.plan) }} ·
                  {{ t()('Implementación', 'Implementation') }} {{ effortName(effort.implement) }}
                </dd>
              </div>
            }
            @if (change.phase === 'review') {
              <div [class]="fact">
                <dt [class]="factLabel">{{ t()('Por decidir', 'To decide') }}</dt>
                <dd class="m-0 text-sm" [style.color]="change.highImpactPending ? 'var(--color-phase-review)' : 'var(--color-phase-done)'" data-to-decide>{{ toDecide() }}</dd>
              </div>
            }
          </dl>
          @for (problem of change.problems; track problem) {
            <p class="m-0 mt-2 flex items-center gap-2 text-sm" role="note">
              <svg [lucideIcon]="warning" size="14" aria-hidden="true" style="color: var(--color-phase-review)"></svg>
              {{ problem }}
            </p>
          }
        </header>

        <div class="mx-auto mt-2 w-full max-w-6xl px-6">
          <sp-tabs [label]="t()('Secciones del cambio', 'Change sections')" [selected]="tab()" (selectedChange)="select($event)">
            <sp-tab-panel value="spec" label="Spec">
              <sp-spec-review [change]="change" [(reading)]="reading" />
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
        </div>
      } @else if (store.views.hasValue()) {
        <section class="mx-auto mt-8 flex w-full max-w-6xl flex-col items-start gap-3 px-6" role="status">
          <h1 class="m-0 text-lg font-semibold">{{ t()('No existe ese cambio', 'That change does not exist') }}</h1>
          <p class="m-0 text-sm text-text-muted">
            <code class="font-mono">{{ id() }}</code>
            {{ t()('no está entre los cambios del proyecto.', 'is not among the changes of the project.') }}
          </p>
          <a routerLink="/">{{ t()('Volver a la Bandeja', 'Back to the Inbox') }}</a>
        </section>
      } @else {
        <div class="mx-auto mt-8 flex w-full max-w-6xl flex-col gap-6 px-6">
          <sp-skeleton height="2rem" width="60%" />
          <sp-skeleton height="12rem" [announce]="false" />
        </div>
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
  protected readonly barShown = BAR_SHOWN;
  protected readonly barHidden = BAR_HIDDEN;
  protected readonly fact = FACT;
  protected readonly factLabel = FACT_LABEL;
  protected readonly change = this.store.byId(this.id);
  /** The wide header is out of view: show the compact bar. */
  protected readonly compact = signal(false);
  /** The spec section being read, from the review. */
  protected readonly reading = signal<ReviewSection | undefined>(undefined);
  private readonly bar = viewChild<ElementRef<HTMLElement>>("bar");
  private readonly hero = viewChild<ElementRef<HTMLElement>>("hero");

  constructor() {
    const host: HTMLElement = inject(ElementRef).nativeElement;
    let resize: ResizeObserver | undefined;
    let intersection: IntersectionObserver | undefined;
    // Sticky parts below (spec index, comments, anchors) start under the compact bar.
    effect(() => {
      const bar = this.bar()?.nativeElement;
      resize?.disconnect();
      if (bar === undefined || typeof ResizeObserver === "undefined") return;
      resize = new ResizeObserver(() =>
        host.style.setProperty("--sp-sticky-top", `${bar.offsetHeight}px`),
      );
      resize.observe(bar);
    });
    // Without IntersectionObserver the bar stays hidden and the wide header still serves.
    effect(() => {
      const hero = this.hero()?.nativeElement;
      intersection?.disconnect();
      if (hero === undefined || typeof IntersectionObserver === "undefined") return;
      intersection = new IntersectionObserver(([entry]) => {
        if (entry !== undefined) this.compact.set(!entry.isIntersecting);
      });
      intersection.observe(hero);
    });
    inject(DestroyRef).onDestroy(() => {
      resize?.disconnect();
      intersection?.disconnect();
    });
  }

  /** The tab in the URL if valid; otherwise, the one for the change's phase. */
  protected readonly tab = linkedSignal<ChangeTab>(() => {
    const asked = TABS.find((tab) => tab === this.tabParam());
    return asked ?? this.change()?.tab ?? "spec";
  });

  protected readonly reasons = computed(() => {
    const lang = this.preferences.lang();
    return (this.change()?.size?.reasons ?? []).map((reason) => reason[lang]).join(" · ");
  });

  /** "04 Criterios": the section being read, numbered as in the document. */
  protected readonly readingLabel = computed(() => {
    const key = this.reading();
    const present = (this.change()?.review.index ?? []).filter((entry) => entry.present);
    const position = present.findIndex((entry) => entry.key === key);
    if (key === undefined || position < 0) return "";
    return `${sectionNumber(position)} ${SECTION_LABELS[key][this.preferences.lang()]}`;
  });

  /** High-impact assumptions decided out of all of them, if there are any. */
  protected readonly highImpact = computed(() => {
    const high = (this.change()?.review.assumptions ?? []).filter((item) => item.impact === "high");
    if (high.length === 0) return undefined;
    const decided = high.filter((item) => item.decision !== "pending").length;
    return { decided, total: high.length };
  });

  protected readonly openComments = computed(
    () => (this.change()?.review.comments ?? []).filter((comment) => !comment.resolved).length,
  );

  protected readonly toDecide = computed(() => {
    const t = this.t();
    const pending = this.change()?.highImpactPending ?? 0;
    if (pending === 0) return t("Nada pendiente", "Nothing pending");
    return pending === 1
      ? t("1 supuesto de alto impacto", "1 high-impact assumption")
      : t(`${pending} supuestos de alto impacto`, `${pending} high-impact assumptions`);
  });

  protected effortName(level: EffortLevel): string {
    return EFFORT[level][this.preferences.lang()];
  }

  protected since(iso: string): string {
    return relativeTime(iso, Date.now(), this.preferences.lang());
  }

  protected select(value: string | undefined): void {
    const tab = TABS.find((candidate) => candidate === value);
    if (tab === undefined) return;
    this.tab.set(tab);
    void this.router.navigate([], { queryParams: { tab }, replaceUrl: true });
  }
}
