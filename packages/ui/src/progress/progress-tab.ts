// SPDX-License-Identifier: Apache-2.0
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from "@angular/core";
import { LIST, SectionDivider } from "../components/document";
import { EmptyState } from "../components/empty-state";
import { LucideListChecks } from "../components/icons";
import { formatDuration, type RunRecord, type TaskStatus, workTime } from "../data/progress";
import { type ChangeView, SpectyData } from "../data/records";
import { Preferences } from "../theme/preferences";
import { LiveOutput } from "./live-output";
import { LockedTests } from "./locked-tests";
import { ScopeRequest } from "./scope-request";
import { TaskRow } from "./task-row";
import { TestsSent } from "./tests-sent";

const TICK_MS = 30_000;

/** Each task's part of the bar, in its state's color. */
const SEGMENTS: Readonly<Record<TaskStatus, string>> = {
  done: "var(--color-phase-done)",
  active: "var(--color-phase-implementing)",
  pending: "color-mix(in oklab, var(--color-text) 10%, transparent)",
};

/**
 * The Progress tab (docs/ui.md, Progreso): the tasks in the spec's order as document rows. A task
 * waiting for the person's decision leaves its place for «Te espera» at the top and goes back to
 * it once decided. In `testing`, the tests the agent writes or sent go first; then the approved
 * tests it locked.
 */
@Component({
  selector: "sp-progress-tab",
  imports: [SectionDivider, EmptyState, TaskRow, ScopeRequest, LiveOutput, TestsSent, LockedTests],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "flex flex-col gap-8" },
  template: `
    @if (tasks().length === 0) {
      <sp-empty-state [heading]="t()('Aún no hay tareas', 'No tasks yet')" [icon]="emptyIcon">
        <p class="m-0">{{ t()('Aparecen aquí cuando la spec las define.', 'They show here once the spec defines them.') }}</p>
      </sp-empty-state>
    } @else {
      <div class="flex flex-col gap-2.5">
        <p class="m-0 text-sm text-text-muted" data-summary><strong class="font-semibold text-text">{{ doneLine() }}</strong>{{ rest() }}</p>
        <div class="flex max-w-lg gap-1" aria-hidden="true" data-bar>
          @for (task of tasks(); track task.id) {
            <span class="h-1.5 flex-1 rounded-full" [style.background]="segments[task.status]"></span>
          }
        </div>
      </div>
      @if (change().tests; as tests) {
        <sp-tests-sent [tests]="tests" [now]="now()" />
      }
      @if (change().lockedTests; as locked) {
        <sp-locked-tests [tests]="locked" />
      }
      @if (waiting().length > 0) {
        <section aria-labelledby="progress-waiting" data-waiting>
          <sp-section-divider [heading]="t()('Te espera', 'Waiting for you')" headingId="progress-waiting" [meta]="waiting().length" [level]="2" />
          <div role="list" [class]="list + ' mt-2'">
            @for (task of waiting(); track task.id) {
              <sp-task-row [task]="task" [now]="now()" [live]="liveOn(task.id) !== undefined">
                @if (task.status === 'active') {
                  <sp-live-output [task]="task.id" [run]="liveOn(task.id)" [verification]="task.verification" />
                }
                @for (request of task.scopeRequests; track request.id) {
                  <sp-scope-request class="mt-1" [change]="change().id" [task]="task.id" [request]="request" />
                }
              </sp-task-row>
            }
          </div>
        </section>
      }
      <section aria-labelledby="progress-tasks" data-tasks>
        <sp-section-divider [heading]="t()('Tareas', 'Tasks')" headingId="progress-tasks" [meta]="doneOfTotal()" [level]="2" />
        <div role="list" [class]="list + ' mt-2'">
          @for (task of listed(); track task.id) {
            <sp-task-row [task]="task" [now]="now()" [live]="liveOn(task.id) !== undefined">
              @if (task.status === 'active') {
                <sp-live-output [task]="task.id" [run]="liveOn(task.id)" [verification]="task.verification" />
              }
            </sp-task-row>
          }
        </div>
      </section>
    }
  `,
})
export class ProgressTab {
  readonly change = input.required<ChangeView>();

  private readonly preferences = inject(Preferences);
  protected readonly t = this.preferences.t;
  protected readonly list = LIST;
  protected readonly segments = SEGMENTS;
  protected readonly emptyIcon = LucideListChecks;
  protected readonly now = signal(Date.now());
  /** The verification running in this change, streamed apart from the derived views. */
  private readonly run = signal<RunRecord | undefined>(undefined);
  private readonly id = computed(() => this.change().id);

  protected readonly tasks = computed(() => this.change().progress.tasks);
  /** Tasks with a decision of the person pending: at the top, out of the list. */
  protected readonly waiting = computed(() =>
    this.tasks().filter((task) => task.scopeRequests.length > 0),
  );
  /** The rest, in the spec's order. */
  protected readonly listed = computed(() =>
    this.tasks().filter((task) => task.scopeRequests.length === 0),
  );
  private readonly done = computed(
    () => this.tasks().filter((task) => task.status === "done").length,
  );

  /** «2 de 3 tareas hechas». */
  protected readonly doneLine = computed(() =>
    this.t()(
      `${this.done()} de ${this.tasks().length} tareas hechas`,
      `${this.done()} of ${this.tasks().length} tasks done`,
    ),
  );

  protected readonly doneOfTotal = computed(() =>
    this.t()(
      `${this.done()} de ${this.tasks().length}`,
      `${this.done()} of ${this.tasks().length}`,
    ),
  );

  /** « · 37 min de trabajo · 1 decisión te espera», each part only when there is something. */
  protected readonly rest = computed(() => {
    const t = this.t();
    const worked = workTime(this.change().progress, this.now());
    const decisions = this.waiting().reduce((sum, task) => sum + task.scopeRequests.length, 0);
    const parts = [
      worked > 0
        ? t(`${formatDuration(worked, "es")} de trabajo`, `${formatDuration(worked, "en")} of work`)
        : "",
      decisions === 1
        ? t("1 decisión te espera", "1 decision waits for you")
        : decisions > 1
          ? t(`${decisions} decisiones te esperan`, `${decisions} decisions wait for you`)
          : "",
    ];
    return parts
      .filter((part) => part !== "")
      .map((part) => ` · ${part}`)
      .join("");
  });

  /** The run on this task, while one goes on. */
  protected liveOn(task: string): RunRecord | undefined {
    const run = this.run();
    return run?.task === task ? run : undefined;
  }

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), TICK_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
    const source = inject(SpectyData);
    effect((onCleanup) => {
      onCleanup(source.watchRun(this.id(), (run) => this.run.set(run)));
    });
  }
}
