// SPDX-License-Identifier: Apache-2.0
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  effect,
  InjectionToken,
  inject,
  input,
  linkedSignal,
  signal,
  untracked,
  viewChild,
} from "@angular/core";
import { Router, RouterLink } from "@angular/router";
import type { EffortLevel, Phase } from "@baquia-dev/specty-core";
import { LucideDynamicIcon } from "@lucide/angular";
import { AcceptanceActions } from "../acceptance/acceptance-actions";
import { AcceptanceTab } from "../acceptance/acceptance-tab";
import { ClosingActions } from "../acceptance/closing-actions";
import { PhaseBadge } from "../components/badge";
import { PAGE } from "../components/document";
import { EmptyState } from "../components/empty-state";
import {
  LucideArrowLeft,
  LucideFileQuestion,
  LucideLightbulb,
  LucideTriangleAlert,
} from "../components/icons";
import { Skeleton } from "../components/skeleton";
import { TabPanel, Tabs } from "../components/tabs";
import { ChangesStore } from "../data/changes-store";
import {
  type ChangeTab,
  type DecisionKind,
  type ReviewSection,
  relativeTime,
} from "../data/records";
import { ProgressTab } from "../progress/progress-tab";
import { TestsActions } from "../progress/tests-actions";
import { ReviewActions } from "../review/review-actions";
import { SpecReview } from "../review/spec-review";
import { Preferences } from "../theme/preferences";
import { ChangeBar } from "./change-bar";
import { ChangeFacts } from "./change-facts";

const TABS: readonly ChangeTab[] = ["spec", "progress", "acceptance", "history"];

/**
 * Whether the header suggests the effort for the agent («implementar con esfuerzo medio y
 * revisar con alto»). Hidden for now; the effort is still derived, so showing it again only
 * takes changing this default.
 */
export const SHOW_EFFORT_HINT = new InjectionToken<boolean>("SHOW_EFFORT_HINT", {
  factory: () => false,
});

const EFFORT: Readonly<Record<EffortLevel, { es: string; en: string }>> = {
  low: { es: "bajo", en: "low" },
  medium: { es: "medio", en: "medium" },
  high: { es: "alto", en: "high" },
  max: { es: "máximo", en: "max" },
};

const WAITING: Readonly<Record<DecisionKind, { es: string; en: string }>> = {
  review: { es: "Espera tu revisión de la spec", en: "Waiting for your spec review" },
  tests: { es: "Espera que apruebes los tests", en: "Waiting for you to approve the tests" },
  scope: { es: "Espera tu decisión sobre el alcance", en: "Waiting for your scope decision" },
  acceptance: { es: "Espera que aceptes el resultado", en: "Waiting for you to accept the result" },
  closing: { es: "Espera que confirmes el cierre", en: "Waiting for you to confirm the closing" },
};

/** One change: a wide header, a compact bar while scrolling, and the tabs Spec · Progress · Acceptance · History. */
@Component({
  selector: "sp-change-page",
  imports: [
    RouterLink,
    LucideDynamicIcon,
    PhaseBadge,
    Skeleton,
    EmptyState,
    Tabs,
    TabPanel,
    SpecReview,
    ReviewActions,
    ChangeBar,
    ChangeFacts,
    ProgressTab,
    AcceptanceTab,
    AcceptanceActions,
    ClosingActions,
    TestsActions,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col">
      @if (change(); as change) {
        <!-- Zero height in the flow: the bar never pushes the content. -->
        <div class="sticky top-0 z-20 h-0">
          <sp-change-bar #bar [change]="change" [shown]="compact()" [reading]="tab() === 'spec' ? reading() : undefined" />
        </div>

        <header #hero [class]="page + ' flex flex-col pt-8'" data-hero>
          <p class="m-0 flex items-center gap-2 text-sm text-text-muted">
            <a routerLink="/" class="flex items-center gap-1 text-text-muted">
              <svg [lucideIcon]="back" size="14" aria-hidden="true"></svg>{{ t()('Bandeja', 'Inbox') }}
            </a>
            <span aria-hidden="true">/</span>
            <span class="min-w-0 truncate font-mono text-xs">{{ change.id }}</span>
          </p>
          <div class="mt-6 flex flex-wrap items-start gap-x-8 gap-y-4">
            <div class="flex min-w-0 flex-[1_1_28rem] flex-col">
              <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <sp-phase-badge [phase]="change.phase" />
                @if (change.decision; as decision) {
                  <span class="text-sm text-text-muted" data-waiting>{{ t()(waiting[decision].es, waiting[decision].en) }}</span>
                  <span class="hidden text-sm text-text-muted sm:inline" aria-hidden="true">·</span>
                }
                <!-- On a phone, how long goes on its own line instead of after a dangling dot. -->
                <span class="w-full text-sm text-text-muted sm:w-auto" data-since>{{ since(change.phaseSince) }}</span>
              </div>
              <h1 class="mt-3 mb-0 max-w-4xl text-[1.75rem] leading-[1.15] font-semibold tracking-[-0.028em] sm:text-[2.375rem]">{{ change.title }}</h1>
            </div>
            <!--
              Beside the title: the decision waiting (on the spec in review, on the tests once the
              agent sent them, on the result in acceptance, on the closing once the agent sent it)
              and, as a suggestion rather than a fact of the change, the effort for the agent.
              Under the title, at its edge.
            -->
            @if (change.phase === 'review' || change.phase === 'acceptance' || change.decision === 'closing' || change.decision === 'tests' || (showEffort && change.effort)) {
              <div class="mt-1 flex flex-col items-end gap-3 max-lg:items-start">
                @if (change.phase === 'review') {
                  <sp-review-actions class="max-lg:items-start" [change]="change" />
                } @else if (change.decision === 'tests') {
                  <sp-tests-actions [change]="change" />
                } @else if (change.phase === 'acceptance') {
                  <sp-acceptance-actions class="flex-wrap" [change]="change" />
                } @else if (change.decision === 'closing') {
                  <sp-closing-actions [change]="change" />
                }
                @if (showEffort && change.effort; as effort) {
                  <p class="m-0 flex max-w-80 items-start gap-2 text-[13px] text-text-muted" data-effort>
                    <svg class="mt-0.5 shrink-0" [lucideIcon]="suggestion" size="14" aria-hidden="true"></svg>
                    <span><span class="font-medium">{{ t()('Sugerencia para el agente:', 'Suggestion for the agent:') }}</span>&ngsp;{{ effortHint(change.phase, effort) }}</span>
                  </p>
                }
              </div>
            }
          </div>
          <sp-change-facts [change]="change" />
          @for (problem of change.problems; track problem) {
            <p class="m-0 mt-2 flex items-center gap-2 text-sm" role="note">
              <svg [lucideIcon]="warning" size="14" aria-hidden="true" style="color: var(--color-phase-review)"></svg>
              {{ problem }}
            </p>
          }
        </header>

        <div [class]="page + ' mt-2'">
          <sp-tabs [label]="t()('Secciones del cambio', 'Change sections')" [selected]="tab()" (selectedChange)="select($event)">
            <sp-tab-panel value="spec" label="Spec">
              <sp-spec-review [change]="change" [(reading)]="reading" />
            </sp-tab-panel>
            <sp-tab-panel value="progress" [label]="t()('Progreso', 'Progress')">
              <sp-progress-tab class="pt-2" [change]="change" />
            </sp-tab-panel>
            <sp-tab-panel value="acceptance" [label]="t()('Aceptación', 'Acceptance')">
              <sp-acceptance-tab class="pt-2" [change]="change" />
            </sp-tab-panel>
            <sp-tab-panel value="history" [label]="t()('Historial', 'History')">
              <p class="m-0 text-sm text-text-muted">{{ t()('El historial y la trazabilidad llegan en la fase 3.', 'History and traceability come in phase 3.') }}</p>
            </sp-tab-panel>
          </sp-tabs>
        </div>
      } @else if (store.views.hasValue()) {
        <sp-empty-state [class]="page" [heading]="t()('No existe ese cambio', 'That change does not exist')" [icon]="missing" [level]="1">
          <p class="m-0 text-sm text-text-muted">
            <code class="font-mono">{{ id() }}</code>
            {{ t()('no está entre los cambios del proyecto.', 'is not among the changes of the project.') }}
          </p>
          <a routerLink="/" class="font-medium text-text">{{ t()('Volver a la Bandeja', 'Back to the Inbox') }}</a>
        </sp-empty-state>
      } @else {
        <div [class]="page + ' mt-8 flex flex-col gap-6'">
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
  protected readonly missing = LucideFileQuestion;
  protected readonly page = PAGE;
  protected readonly waiting = WAITING;
  protected readonly suggestion = LucideLightbulb;
  protected readonly showEffort = inject(SHOW_EFFORT_HINT);
  protected readonly change = this.store.byId(this.id);
  /** The wide header is out of view: show the compact bar. */
  protected readonly compact = signal(false);
  /** The spec section being read, from the review. */
  protected readonly reading = signal<ReviewSection | undefined>(undefined);
  private readonly bar = viewChild("bar", { read: ElementRef<HTMLElement> });
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

  private readonly changeId = computed(() => this.change()?.id);

  /**
   * The tab in the URL if valid; otherwise, the one for the change's phase when it opens. A new
   * phase while the person looks does not move them: confirming a closing keeps it in sight.
   */
  protected readonly tab = linkedSignal<
    readonly [string | undefined, string | undefined],
    ChangeTab
  >({
    source: () => [this.tabParam(), this.changeId()],
    computation: ([param]) =>
      TABS.find((tab) => tab === param) ?? untracked(() => this.change()?.tab) ?? "spec",
  });

  /**
   * «implementar con esfuerzo medio y revisar con alto»: once the spec is written, the planning
   * level serves to adjust it and decide scope; in a draft, to write it.
   */
  protected effortHint(
    phase: Phase,
    effort: { plan: EffortLevel; implement: EffortLevel },
  ): string {
    const lang = this.preferences.lang();
    const [plan, implement] = [EFFORT[effort.plan][lang], EFFORT[effort.implement][lang]];
    if (phase === "draft") {
      return this.t()(
        `planificar con esfuerzo ${plan} e implementar con ${implement}.`,
        `plan at ${plan} effort and implement at ${implement}.`,
      );
    }
    return this.t()(
      `implementar con esfuerzo ${implement} y revisar con ${plan}.`,
      `implement at ${implement} effort and review at ${plan}.`,
    );
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
