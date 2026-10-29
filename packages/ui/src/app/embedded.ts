// SPDX-License-Identifier: Apache-2.0
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type Provider,
  signal,
} from "@angular/core";
import type { Phase } from "@baquia-dev/specty-core/light";
import { AcceptanceTab } from "../acceptance/acceptance-tab";
import { PhaseBadge } from "../components/badge";
import { PAGE } from "../components/document";
import { ChangesStore, DERIVER, inThread } from "../data/changes-store";
import { McpAppData } from "../data/mcp-app";
import {
  ActionError,
  type ChangeTab,
  type DecisionKind,
  type ReviewSection,
  SpectyData,
} from "../data/records";
import { HistoryTab } from "../history/history-tab";
import { ProgressTab } from "../progress/progress-tab";
import { SpecReview } from "../review/spec-review";
import { Preferences } from "../theme/preferences";

/**
 * The tab the chat shows for each phase: the spec while it is written and reviewed, the progress
 * while tests and code are written, and the acceptance, with its closing, from then on.
 */
const TAB: Readonly<Record<Phase, ChangeTab>> = {
  draft: "spec",
  review: "spec",
  testing: "progress",
  implementing: "progress",
  adjusting: "progress",
  acceptance: "acceptance",
  closing: "acceptance",
  done: "acceptance",
  cancelled: "history",
};

/** Where the person decides what the change waits for: the terminal's command, or `specty ui`. */
const DECIDE: Readonly<Record<DecisionKind, { es: string; en: string; command: string }>> = {
  review: {
    es: "Revisa la spec y apruébala",
    en: "Review the spec and approve it",
    command: "specty approve",
  },
  tests: { es: "Aprueba los tests", en: "Approve the tests", command: "specty approve" },
  scope: { es: "Decide el alcance", en: "Decide the scope", command: "specty approve --scope" },
  acceptance: { es: "Acepta el resultado", en: "Accept the result", command: "specty accept" },
  closing: { es: "Confirma el cierre", en: "Confirm the closing", command: "specty close" },
};

/**
 * The view of an MCP App (ADR 0015): the change a tool worked on, in the chat, with only the tab
 * of its phase. No inbox, no navigation and no actions: where a decision waits, it says where to
 * take it.
 */
@Component({
  // The page's root element, as the shell's: in an MCP App this view takes its place.
  selector: "sp-root",
  imports: [PhaseBadge, SpecReview, ProgressTab, AcceptanceTab, HistoryTab],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main [class]="page + ' flex flex-col gap-6 py-6'">
      @if (change(); as change) {
        <header class="flex flex-col gap-2">
          <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <sp-phase-badge [phase]="change.phase" />
            <span class="min-w-0 truncate font-mono text-xs text-text-muted">{{ change.id }}</span>
          </div>
          <h1 class="m-0 text-xl leading-tight font-semibold tracking-[-0.02em]">{{ change.title }}</h1>
          @if (change.decision; as decision) {
            <p class="m-0 text-sm text-text-muted" data-decide>
              {{ t()(decide[decision].es, decide[decision].en) }}
              {{ t()('en la terminal con', 'in the terminal with') }}
              <code class="font-mono">{{ decide[decision].command }}</code>
              {{ t()('o en', 'or in') }} <code class="font-mono">specty ui</code>.
            </p>
          }
        </header>
        @switch (tab()) {
          @case ("spec") {
            <sp-spec-review [change]="change" [(reading)]="reading" />
          }
          @case ("progress") {
            <sp-progress-tab [change]="change" />
          }
          @case ("acceptance") {
            <sp-acceptance-tab [change]="change" />
          }
          @case ("history") {
            <sp-history-tab [history]="change.history" [change]="change.id" />
          }
        }
      } @else if (problem(); as problem) {
        <p role="alert" class="m-0 text-sm text-text-muted">{{ problem }}</p>
      } @else {
        <p class="m-0 text-sm text-text-muted">{{ t()('Esperando el cambio…', 'Waiting for the change…') }}</p>
      }
    </main>
  `,
})
export class Embedded {
  private readonly store = inject(ChangesStore);
  private readonly preferences = inject(Preferences);
  protected readonly t = this.preferences.t;
  protected readonly page = PAGE;
  protected readonly decide = DECIDE;
  /** The one change the host's tool worked on. */
  protected readonly change = computed(() => this.store.all()[0]);
  protected readonly tab = computed(() => {
    const change = this.change();
    return change === undefined ? "spec" : TAB[change.phase];
  });
  /** Why the change cannot be read, as the source says it. */
  protected readonly problem = computed(() => {
    const error = this.store.views.error();
    if (error === undefined) return undefined;
    return error instanceof ActionError ? error.text[this.preferences.lang()] : error.message;
  });
  /** The spec section being read: the review keeps its index in step. */
  protected readonly reading = signal<ReviewSection | undefined>(undefined);
}

/**
 * What the embedded view starts with: the host's data, and views derived in the main thread,
 * because the frame of an MCP App cannot start a worker.
 */
export function embeddedProviders(): Provider[] {
  return [
    { provide: SpectyData, useClass: McpAppData },
    { provide: DERIVER, useValue: inThread },
  ];
}
