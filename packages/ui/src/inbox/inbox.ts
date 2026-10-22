// SPDX-License-Identifier: Apache-2.0
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
} from "@angular/core";
import { RouterLink } from "@angular/router";
import { PHASES } from "@baquia-dev/specty-core";
import { LucideClock, LucideDynamicIcon, LucideTriangleAlert } from "@lucide/angular";
import { Badge, PhaseBadge } from "../components/badge";
import { Button } from "../components/button";
import { Card } from "../components/card";
import { Kbd } from "../components/kbd";
import { Skeleton } from "../components/skeleton";
import { ChangesStore } from "../data/changes-store";
import { type ChangeView, type DecisionKind, relativeTime } from "../data/records";
import { Shortcuts } from "../keyboard/shortcuts";
import { Preferences } from "../theme/preferences";

const DECISIONS: Readonly<
  Record<DecisionKind, { es: string; en: string; actionEs: string; actionEn: string }>
> = {
  review: {
    es: "Spec por revisar",
    en: "Spec to review",
    actionEs: "Revisar spec",
    actionEn: "Review spec",
  },
  scope: {
    es: "Solicitud de alcance",
    en: "Scope request",
    actionEs: "Decidir alcance",
    actionEn: "Decide scope",
  },
  acceptance: {
    es: "Resultado por aceptar",
    en: "Result to accept",
    actionEs: "Revisar resultado",
    actionEn: "Review result",
  },
  closing: {
    es: "Cierre por confirmar",
    en: "Closing to confirm",
    actionEs: "Revisar cierre",
    actionEn: "Review closing",
  },
};

const TICK_MS = 30_000;

/** What waits for the person first, then work in progress by phase, then recent changes. */
@Component({
  selector: "sp-inbox",
  imports: [RouterLink, LucideDynamicIcon, Badge, PhaseBadge, Button, Card, Kbd, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-4xl flex-col gap-10 px-6 py-8">
      <header class="flex flex-wrap items-baseline justify-between gap-3">
        <h1 class="m-0 text-xl font-semibold">{{ t()('Bandeja', 'Inbox') }}</h1>
        <span class="flex items-center gap-1 text-xs text-text-muted">
          <sp-kbd keys="j" /> <sp-kbd keys="k" /> {{ t()('moverte', 'move') }} ·
          <sp-kbd keys="enter" /> {{ t()('abrir', 'open') }}
        </span>
      </header>

      @if (store.views.error(); as error) {
        <div role="alert" class="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-4">
          <svg [lucideIcon]="warning" size="16" aria-hidden="true" style="color: var(--color-phase-cancelled)"></svg>
          <p class="m-0 flex-1 text-sm">
            {{ t()('No se pudieron leer los cambios', 'Could not read the changes') }}: {{ message(error) }}
          </p>
          <sp-button size="sm" (pressed)="store.views.reload()">{{ t()('Reintentar', 'Retry') }}</sp-button>
        </div>
      } @else if (!store.views.hasValue()) {
        <div class="flex flex-col gap-3">
          <sp-skeleton height="7rem" />
          <sp-skeleton height="7rem" [announce]="false" />
          <sp-skeleton height="3rem" [announce]="false" />
        </div>
      } @else {
        <section class="flex flex-col gap-3" aria-labelledby="decisions">
          <h2 id="decisions" class="m-0 flex items-center gap-2 text-lg font-semibold">
            {{ t()('Esperan tu decisión', 'Waiting for your decision') }}
            <sp-badge>{{ store.decisions().length }}</sp-badge>
          </h2>
          @for (change of store.decisions(); track change.id; let index = $index) {
            <sp-card [selected]="index === selected()" [attr.data-id]="change.id">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="flex items-center gap-2">
                  <sp-phase-badge [phase]="change.phase" />
                  <span class="text-sm font-medium" data-decision>{{ decisionLabel(change) }}</span>
                </span>
                <span class="flex items-center gap-1 text-xs text-text-muted">
                  <svg [lucideIcon]="clock" size="13" aria-hidden="true"></svg>{{ since(change) }}
                </span>
              </div>
              <a class="text-md font-semibold no-underline hover:underline" [routerLink]="['/changes', change.id]" [queryParams]="{ tab: change.tab }" (focus)="selected.set(index)">{{ change.title }}</a>
              <p class="m-0 flex flex-wrap items-center gap-2 text-sm text-text-muted">
                @if (change.size; as size) {
                  <sp-badge>{{ size.level }}</sp-badge> {{ reasons(change) }}
                }
                <code class="font-mono text-xs">{{ change.id }}</code>
              </p>
              @if (change.highImpactPending > 0) {
                <p class="m-0 flex items-center gap-2 text-sm">
                  <svg [lucideIcon]="warning" size="14" aria-hidden="true" style="color: var(--color-phase-review)"></svg>
                  {{ pendingText(change.highImpactPending) }}
                </p>
              }
              @for (request of change.scopeRequests; track request.id) {
                <p class="m-0 text-sm text-text-muted">
                  {{ request.task }} {{ t()('pide', 'asks for') }}
                  @for (path of request.paths; track path) {
                    <code class="font-mono text-xs text-text">{{ path }}</code>
                  }
                  : «{{ request.reason }}»
                </p>
              }
              <div>
                <sp-button size="sm" [variant]="index === selected() ? 'primary' : 'secondary'" (pressed)="open(change)">
                  {{ t()(decisions[change.decision ?? 'review'].actionEs, decisions[change.decision ?? 'review'].actionEn) }}
                </sp-button>
              </div>
            </sp-card>
          } @empty {
            <p class="m-0 text-sm text-text-muted">{{ t()('Nada espera tu decisión.', 'Nothing waits for your decision.') }}</p>
          }
        </section>

        <section class="flex flex-col gap-4" aria-labelledby="active">
          <h2 id="active" class="m-0 text-lg font-semibold">{{ t()('En curso', 'In progress') }}</h2>
          @for (group of groups(); track group.phase) {
            <div class="flex flex-col gap-2">
              <sp-phase-badge class="self-start" [phase]="group.phase" />
              @for (change of group.changes; track change.id) {
                <sp-card [selected]="offset(change) === selected()" [attr.data-id]="change.id">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <a class="font-medium no-underline hover:underline" [routerLink]="['/changes', change.id]" [queryParams]="{ tab: change.tab }" (focus)="selected.set(offset(change))">{{ change.title }}</a>
                    <span class="text-xs text-text-muted">
                      @if (change.tasks.total > 0) {
                        {{ change.tasks.done }}/{{ change.tasks.total }} {{ t()('tareas', 'tasks') }} ·
                      }
                      {{ since(change) }}
                    </span>
                  </div>
                </sp-card>
              }
            </div>
          } @empty {
            <p class="m-0 text-sm text-text-muted">{{ t()('Ningún cambio en curso.', 'No change in progress.') }}</p>
          }
        </section>

        @if (store.recent().length > 0) {
          <section class="flex flex-col gap-2" aria-labelledby="recent">
            <h2 id="recent" class="m-0 text-lg font-semibold">{{ t()('Recientes', 'Recent') }}</h2>
            <ul class="m-0 flex list-none flex-col gap-1 p-0">
              @for (change of store.recent(); track change.id) {
                <li class="flex flex-wrap items-center gap-2 text-sm">
                  <sp-phase-badge [phase]="change.phase" />
                  <a [routerLink]="['/changes', change.id]">{{ change.title }}</a>
                  <span class="text-xs text-text-muted">{{ since(change) }}</span>
                </li>
              }
            </ul>
          </section>
        }
      }
    </div>
  `,
})
export class Inbox {
  protected readonly store = inject(ChangesStore);
  private readonly preferences = inject(Preferences);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  protected readonly t = this.preferences.t;
  protected readonly decisions = DECISIONS;
  protected readonly clock = LucideClock;
  protected readonly warning = LucideTriangleAlert;
  protected readonly selected = signal(0);
  private readonly now = signal(Date.now());

  /** In progress, by phase in flow order. */
  protected readonly groups = computed(() =>
    PHASES.map((phase) => ({
      phase,
      changes: this.store.active().filter((change) => change.phase === phase),
    })).filter((group) => group.changes.length > 0),
  );
  /** Everything j/k can select: decisions first, then work in progress. */
  private readonly selectable = computed(() => [
    ...this.store.decisions(),
    ...this.groups().flatMap((group) => group.changes),
  ]);

  constructor() {
    const shortcuts = inject(Shortcuts);
    const move = (step: number) => () => {
      const last = this.selectable().length - 1;
      if (last < 0) return;
      this.selected.update((index) => Math.min(Math.max(index + step, 0), last));
      const id = this.selectable()[this.selected()]?.id ?? "";
      this.host.querySelector<HTMLElement>(`sp-card[data-id="${id}"] a`)?.focus();
    };
    shortcuts.register({
      keys: "j",
      description: { es: "Siguiente cambio", en: "Next change" },
      run: move(1),
    });
    shortcuts.register({
      keys: "k",
      description: { es: "Cambio anterior", en: "Previous change" },
      run: move(-1),
    });
    const timer = setInterval(() => this.now.set(Date.now()), TICK_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected offset(change: ChangeView): number {
    return this.selectable().findIndex((item) => item.id === change.id);
  }

  protected open(change: ChangeView): void {
    this.host.querySelector<HTMLAnchorElement>(`sp-card[data-id="${change.id}"] a`)?.click();
  }

  protected since(change: ChangeView): string {
    return relativeTime(change.phaseSince, this.now(), this.preferences.lang());
  }

  protected decisionLabel(change: ChangeView): string {
    const label = DECISIONS[change.decision ?? "review"];
    return this.t()(label.es, label.en);
  }

  protected reasons(change: ChangeView): string {
    const lang = this.preferences.lang();
    return (change.size?.reasons ?? []).map((reason) => reason[lang]).join(" · ");
  }

  protected pendingText(count: number): string {
    return this.t()(
      count === 1
        ? "1 supuesto de alto impacto por confirmar"
        : `${count} supuestos de alto impacto por confirmar`,
      count === 1
        ? "1 high-impact assumption to confirm"
        : `${count} high-impact assumptions to confirm`,
    );
  }

  protected message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
