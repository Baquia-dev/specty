// SPDX-License-Identifier: Apache-2.0
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  linkedSignal,
  model,
  type ResourceStatus,
  resource,
} from "@angular/core";
import { DiffViewer } from "../components/diff-viewer";
import { SectionDivider } from "../components/document";
import { EmptyState } from "../components/empty-state";
import { LucideGitCompareArrows } from "../components/icons";
import { Segmented } from "../components/segmented";
import { Skeleton } from "../components/skeleton";
import { parseDiff } from "../data/diff";
import { ActionError, type ChangeView, SpectyData } from "../data/records";
import { Preferences } from "../theme/preferences";

/** The whole change, as the choice of «Qué cambios ver». */
export const WHOLE_CHANGE = "all";

/**
 * The Changes view of the Acceptance tab (docs/ui.md, Aceptación): the diff of the whole change or
 * of one task, from the data source, in the diff viewer. Its title and its bar stay in view while
 * the diff scrolls by; while a new diff loads, the last one stays, dimmed, so the bar that chose
 * it keeps the focus.
 */
@Component({
  selector: "sp-changes-view",
  imports: [DiffViewer, SectionDivider, EmptyState, Segmented, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block" },
  template: `
    <section aria-labelledby="acceptance-changes">
      @if (committed().length === 0) {
        <sp-section-divider [heading]="t()('Cambios', 'Changes')" headingId="acceptance-changes" [level]="2" />
        <sp-empty-state class="mt-3" [heading]="t()('Aún no hay cambios que ver', 'No changes to see yet')" [icon]="emptyIcon">
          <p class="m-0">{{ t()('Aparecen aquí cuando una tarea tiene su commit.', 'They show here once a task has its commit.') }}</p>
        </sp-empty-state>
      } @else {
        <!--
          The title and the bar go in the viewer's fixed band, the loading lines or the failure
          under it: the viewer stays while a diff loads or fails, so they never move nor lose
          the focus.
        -->
        <sp-diff-viewer [files]="files()" [range]="range()" [busy]="loading()">
          <sp-section-divider diffHeading [heading]="t()('Cambios', 'Changes')" headingId="acceptance-changes" [level]="2" />
          @if (committed().length > 1) {
            <sp-segmented [label]="t()('Qué cambios ver', 'Which changes to see')" [hideLabel]="true" [options]="scopes()" [value]="scope()" (valueChange)="task.set($event)" data-scope />
          }
          <div diffStatus>
            @if (failure(); as failure) {
              <p class="m-0 text-sm" role="alert" data-error>{{ failure }}</p>
            } @else {
              <sp-skeleton [lines]="6" height="12px" />
            }
          </div>
        </sp-diff-viewer>
      }
    </section>
  `,
})
export class ChangesView {
  readonly change = input.required<ChangeView>();
  /** The task whose diff shows, or `WHOLE_CHANGE`. */
  readonly task = model<string>(WHOLE_CHANGE);

  private readonly source = inject(SpectyData);
  private readonly preferences = inject(Preferences);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  protected readonly t = this.preferences.t;
  protected readonly emptyIcon = LucideGitCompareArrows;

  /** The tasks with a commit, in the spec's order: the only ones with a diff to see. */
  protected readonly committed = computed(() =>
    this.change().progress.tasks.filter((task) => task.commit !== undefined),
  );
  /** The task chosen, while it has a commit; the whole change otherwise. */
  protected readonly scope = computed(() =>
    this.committed().some((task) => task.id === this.task()) ? this.task() : WHOLE_CHANGE,
  );
  protected readonly scopes = computed(() => [
    { value: WHOLE_CHANGE, label: this.t()("Todo el cambio", "The whole change") },
    ...this.committed().map((task) => ({ value: task.id, label: task.id })),
  ]);

  /** «5d2a7b0 → 3c9d1e2»: from where the task (or the first one) started to its (the last) commit. */
  protected readonly range = computed(() => {
    const tasks = this.committed();
    const chosen = tasks.find((task) => task.id === this.scope());
    const [from, to] = chosen
      ? [chosen.baseCommit, chosen.commit]
      : [tasks[0]?.baseCommit, tasks.at(-1)?.commit];
    return from === undefined || to === undefined ? undefined : `${from} → ${to}`;
  });

  /** Read again whenever the choice changes or a task gets a new commit. */
  private readonly diff = resource({
    params: () => {
      const tasks = this.committed();
      if (tasks.length === 0) return undefined;
      const scope = this.scope();
      return {
        change: this.change().id,
        task: scope === WHOLE_CHANGE ? undefined : scope,
        commits: tasks.map((task) => task.commit).join(" "),
      };
    },
    loader: ({ params }) => this.source.diff(params.change, params.task),
  });

  protected readonly loading = computed(() => this.diff.isLoading());

  /** The diff on screen: the one read, or while the next one loads, the last one. */
  private readonly shown = linkedSignal<
    { readonly status: ResourceStatus; readonly text: string | undefined },
    string | undefined
  >({
    source: () => ({
      status: this.diff.status(),
      text: this.diff.hasValue() ? this.diff.value() : undefined,
    }),
    computation: ({ status, text }, previous) =>
      status === "loading" || status === "reloading" ? previous?.value : text,
  });
  protected readonly files = computed(() => {
    const text = this.shown();
    return text === undefined ? undefined : parseDiff(text);
  });

  /** Why the source could not give the diff, in its own words when it has them. */
  protected readonly failure = computed(() => {
    const error = this.diff.error();
    if (error === undefined) return undefined;
    return error instanceof ActionError
      ? error.text[this.preferences.lang()]
      : this.t()("No se pudo leer el diff.", "The diff could not be read.");
  });

  /** Brings the focus to the view's title, so the keyboard and a screen reader go on from it. */
  focus(): void {
    const heading = this.host.nativeElement.querySelector<HTMLElement>("#acceptance-changes");
    heading?.setAttribute("tabindex", "-1");
    heading?.focus();
  }
}
