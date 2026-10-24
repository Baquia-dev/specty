// SPDX-License-Identifier: Apache-2.0
import { DOCUMENT } from "@angular/common";
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  Injector,
  inject,
  input,
  signal,
  viewChild,
} from "@angular/core";
import { LucideListChecks } from "@lucide/angular";
import { LIST, SectionDivider } from "../components/document";
import { EmptyState } from "../components/empty-state";
import { Select } from "../components/select";
import { evidenceOf, summaryOf } from "../data/acceptance";
import { Decisions } from "../data/decisions";
import type { ChangeView } from "../data/records";
import { Preferences } from "../theme/preferences";
import { ChangesView, WHOLE_CHANGE } from "./changes-view";
import { ClosingView } from "./closing-view";
import { CriterionRow } from "./criterion-row";
import { FullVerification } from "./full-verification";
import { TraceMatrix } from "./trace-matrix";

type AcceptanceView = "list" | "matrix" | "changes";

const VIEWS: readonly AcceptanceView[] = ["list", "matrix", "changes"];
/** The view is a preference, remembered in this browser like the Inbox's grouping. */
const VIEW_KEY = "specty.acceptance.view";

/**
 * The Acceptance tab (docs/ui.md, Aceptación): each criterion with the work that backs it, as
 * document rows or as a matrix of criteria by tasks, and the diff of that work. Outside
 * acceptance it shows the evidence so far, with no actions.
 */
@Component({
  selector: "sp-acceptance-tab",
  imports: [
    SectionDivider,
    EmptyState,
    Select,
    CriterionRow,
    TraceMatrix,
    FullVerification,
    ChangesView,
    ClosingView,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "flex flex-col gap-6" },
  template: `
    @if (evidence().length === 0) {
      <sp-empty-state [heading]="t()('Aún no hay criterios', 'No criteria yet')" [icon]="emptyIcon">
        <p class="m-0">{{ t()('Aparecen aquí cuando la spec los define.', 'They show here once the spec defines them.') }}</p>
      </sp-empty-state>
    } @else {
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="m-0 text-sm text-text-muted" data-summary><strong class="font-semibold text-text">{{ verifiedLine() }}</strong>{{ rest() }}</p>
        <sp-select [label]="t()('Vista', 'View')" [options]="views()" [value]="view()" (valueChange)="choose($event)" data-view />
      </div>
      <!-- After accepting: the closing the agent writes, and once done, what it said. -->
      @if (showsClosing()) {
        <sp-closing-view [change]="change()" />
      }
      <!-- Only when the project has a full verification (verify.full). -->
      @if (change().progress.full; as full) {
        <sp-full-verification [change]="change()" [full]="full" />
      }
      @if (view() === 'changes') {
        <sp-changes-view [change]="change()" [(task)]="diffTask" />
      } @else {
        <section aria-labelledby="acceptance-criteria">
          <sp-section-divider [heading]="t()('Criterios', 'Criteria')" headingId="acceptance-criteria" [meta]="verifiedOfTotal()" [level]="2" />
          @if (view() === 'matrix') {
            <sp-trace-matrix class="mt-3" [evidence]="evidence()" [tasks]="change().progress.tasks" (diff)="showDiff($event)" />
          } @else {
            <div role="list" [class]="list + ' mt-2'">
              @for (item of evidence(); track item.id) {
                <sp-criterion-row [evidence]="item" [change]="change()" [canAdjust]="change().phase === 'acceptance' && decisions.allowed()" (diff)="showDiff($event)" />
              }
            </div>
          }
        </section>
      }
    }
  `,
})
export class AcceptanceTab {
  readonly change = input.required<ChangeView>();

  private readonly window = inject(DOCUMENT).defaultView;
  private readonly preferences = inject(Preferences);
  protected readonly decisions = inject(Decisions);
  protected readonly t = this.preferences.t;
  protected readonly list = LIST;
  protected readonly emptyIcon = LucideListChecks;
  protected readonly view = signal<AcceptanceView>(this.stored() ?? "list");

  protected readonly views = computed(() => [
    { value: "list", label: this.t()("Criterios", "Criteria") },
    { value: "matrix", label: this.t()("Matriz", "Matrix") },
    { value: "changes", label: this.t()("Cambios", "Changes") },
  ]);
  /** The task whose diff the Changes view shows. */
  protected readonly diffTask = signal(WHOLE_CHANGE);
  private readonly changesView = viewChild(ChangesView);
  private readonly injector = inject(Injector);

  protected readonly evidence = computed(() =>
    evidenceOf(this.change().review.criteria, this.change().progress.tasks),
  );
  private readonly summary = computed(() =>
    summaryOf(this.evidence(), this.change().progress.tasks),
  );

  /** «2 de 2 criterios verificados». */
  protected readonly verifiedLine = computed(() => {
    const { verified, criteria } = this.summary();
    return this.t()(
      `${verified} de ${criteria} criterios verificados`,
      `${verified} of ${criteria} criteria verified`,
    );
  });

  protected readonly verifiedOfTotal = computed(() => {
    const { verified, criteria } = this.summary();
    return this.t()(`${verified} de ${criteria}`, `${verified} of ${criteria}`);
  });

  /** « · 2 tareas hechas · 2 commits». */
  protected readonly rest = computed(() => {
    const { done, commits } = this.summary();
    const t = this.t();
    const tasks =
      done === 1
        ? t("1 tarea hecha", "1 task done")
        : t(`${done} tareas hechas`, `${done} tasks done`);
    const made = commits === 1 ? "1 commit" : `${commits} commits`;
    return ` · ${tasks} · ${made}`;
  });

  /** In closing, always; once done, when there is a closing to read (a quick change has none). */
  protected readonly showsClosing = computed(() => {
    const { phase, closing } = this.change();
    return phase === "closing" || (phase === "done" && closing !== undefined);
  });

  constructor() {
    effect(() => this.store(this.view()));
  }

  protected choose(value: string): void {
    const view = VIEWS.find((item) => item === value);
    if (view !== undefined) this.view.set(view);
  }

  /** «Ver diff» of a task: the Changes view with it, and the focus on the view. */
  protected showDiff(task: string): void {
    this.diffTask.set(task);
    this.view.set("changes");
    afterNextRender(() => this.changesView()?.focus(), { injector: this.injector });
  }

  /** Storage can be missing or throw (private mode, blocked site data): the list is the default. */
  private stored(): AcceptanceView | undefined {
    try {
      const value = this.window?.localStorage.getItem(VIEW_KEY);
      return VIEWS.find((item) => item === value);
    } catch {
      return undefined;
    }
  }

  private store(view: AcceptanceView): void {
    try {
      this.window?.localStorage.setItem(VIEW_KEY, view);
    } catch {
      // Not remembered across visits; the current choice still applies.
    }
  }
}
