// SPDX-License-Identifier: Apache-2.0
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import { LucideDynamicIcon } from "@lucide/angular";
import { LucideGitCommitHorizontal } from "../components/icons";
import type { CriterionEvidence } from "../data/acceptance";
import type { TaskProgressView } from "../data/progress";
import { Preferences } from "../theme/preferences";
import { verdictOf } from "./criterion-row";

interface Cell {
  readonly criterion: string;
  readonly task: string;
}

const HEAD =
  "border-b border-border py-2 pr-3 text-left align-bottom text-xs font-medium text-text-muted";
const BODY = "border-b border-border py-1.5 pr-3 align-top";

/**
 * Criteria by tasks, in the spec's order: a covered cell is a button with the task's state and
 * commit, and the cell picked shows that task below. A wide table scrolls sideways in its box.
 */
@Component({
  selector: "sp-trace-matrix",
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "flex flex-col gap-5" },
  template: `
    <div class="overflow-x-auto" data-matrix>
      <table class="w-full min-w-160 border-collapse text-sm">
        <caption class="sr-only">{{ t()('Criterios por tareas', 'Criteria by tasks') }}</caption>
        <thead>
          <tr>
            <th scope="col" [class]="head">{{ t()('Criterio', 'Criterion') }}</th>
            @for (task of tasks(); track task.id) {
              <th scope="col" [class]="head + ' w-44'"><span class="font-mono">{{ task.id }}</span>&ngsp;{{ task.title }}</th>
            }
          </tr>
        </thead>
        <tbody>
          @for (row of evidence(); track row.id) {
            <tr>
              <th scope="row" class="border-b border-border py-3 pr-3 text-left align-top font-normal"><span class="font-mono text-xs text-text-muted">{{ row.id }}</span>&ngsp;{{ row.text }}</th>
              @for (task of tasks(); track task.id) {
                <td [class]="body">
                  @if (covers(row, task)) {
                    <button type="button" [class]="isPicked(row.id, task.id) ? cell + ' border-text bg-text/5' : cell + ' border-border bg-transparent'" [attr.aria-pressed]="isPicked(row.id, task.id)" [attr.aria-label]="label(row.id, task)" (click)="picked.set({ criterion: row.id, task: task.id })" [attr.data-cell]="row.id + '-' + task.id">
                      <svg [lucideIcon]="verdict(task).icon" size="14" aria-hidden="true" [style.color]="'var(--color-phase-' + verdict(task).tone + ')'"></svg>
                      <span class="font-mono text-xs">{{ task.commit ?? t()(verdict(task).es, verdict(task).en) }}</span>
                    </button>
                  } @else {
                    <span class="flex min-h-10 items-center px-2.5 text-text-muted"><span aria-hidden="true">—</span><span class="sr-only">{{ t()(task.id + ' no cubre ' + row.id, task.id + ' does not cover ' + row.id) }}</span></span>
                  }
                </td>
              }
            </tr>
          }
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" class="py-2.5 pr-3 text-left text-[13px] font-medium text-text-muted">{{ t()('Verificación de la tarea', "The task's verification") }}</th>
            @for (task of tasks(); track task.id) {
              <td class="py-2.5 pr-3 text-[13px]" [style.color]="'var(--color-phase-' + verdict(task).tone + ')'">{{ t()(verdict(task).es, verdict(task).en) }}</td>
            }
          </tr>
        </tfoot>
      </table>
    </div>
    @if (detail(); as detail) {
      <div class="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4" aria-live="polite" data-detail>
        <!-- One block per line, so a screen reader does not run them together. -->
        <p class="m-0 text-[13px] text-text-muted"><span class="font-mono text-xs">{{ detail.criterion }}</span> · {{ t()('cubierto por', 'covered by') }}&ngsp;<span class="font-mono text-xs">{{ detail.task.id }}</span></p>
        <p class="m-0 font-semibold">{{ detail.task.title }}</p>
        @if (detail.task.summary; as summary) {
          <p class="m-0 text-sm text-text-muted">{{ summary }}</p>
        }
        <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px] text-text-muted">
          @if (detail.task.commit; as commit) {
            <span class="inline-flex items-center gap-1 font-mono text-xs text-text"><svg [lucideIcon]="commitIcon" size="13" aria-hidden="true"></svg><span class="sr-only">{{ t()('commit', 'commit') }}&ngsp;</span>{{ commit }}</span>&ngsp;
            <button type="button" class="h-6 cursor-pointer border-0 bg-transparent px-1 font-sans text-[13px] text-text underline" (click)="diff.emit(detail.task.id)" data-show-diff>{{ t()('Ver diff', 'Show diff') }}<span class="sr-only">&ngsp;{{ t()('de', 'of') }} {{ detail.task.id }}</span></button>&ngsp;
          }
          @for (file of detail.task.files; track $index) {
            <code class="rounded-md bg-text/5 px-1.5 font-mono text-xs">{{ file }}</code>&ngsp;
          }
          @if (detail.task.attempts > 1) {
            <span>{{ detail.task.attempts }} {{ t()('intentos', 'attempts') }}</span>
          }
        </div>
        <p class="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
          <span class="inline-flex items-center gap-1.5" [style.color]="'var(--color-phase-' + verdict(detail.task).tone + ')'">
            <svg [lucideIcon]="verdict(detail.task).icon" size="14" aria-hidden="true"></svg>{{ t()(verdict(detail.task).es, verdict(detail.task).en) }}
          </span>&ngsp;
          @if (detail.task.verification; as run) {
            <code class="font-mono text-xs text-text-muted">{{ run.command }}</code>
          }
        </p>
      </div>
    }
  `,
})
export class TraceMatrix {
  readonly evidence = input.required<readonly CriterionEvidence[]>();
  readonly tasks = input.required<readonly TaskProgressView[]>();
  /** «Ver diff» of the task in the detail: the task's id. */
  readonly diff = output<string>();

  protected readonly t = inject(Preferences).t;
  protected readonly head = HEAD;
  protected readonly body = BODY;
  protected readonly cell =
    "flex min-h-10 w-full cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-left font-sans text-[13px] text-text";
  protected readonly commitIcon = LucideGitCommitHorizontal;
  protected readonly verdict = verdictOf;
  protected readonly picked = signal<Cell | undefined>(undefined);

  /** The cell picked, or the first covered one: the detail is never empty while there is one. */
  protected readonly detail = computed(() => {
    const picked = this.picked();
    const cells = this.evidence().flatMap((row) =>
      row.tasks.map((task) => ({ criterion: row.id, task })),
    );
    return (
      cells.find((cell) => cell.criterion === picked?.criterion && cell.task.id === picked.task) ??
      cells[0]
    );
  });

  protected covers(row: CriterionEvidence, task: TaskProgressView): boolean {
    return row.tasks.some((item) => item.id === task.id);
  }

  protected isPicked(criterion: string, task: string): boolean {
    const detail = this.detail();
    return detail?.criterion === criterion && detail.task.id === task;
  }

  /** «AC2 cubierto por T2, commit 8b0a4f6, Verificación correcta · 21 s». */
  protected label(criterion: string, task: TaskProgressView): string {
    const verdict = verdictOf(task);
    const commit = task.commit === undefined ? "" : `, commit ${task.commit}`;
    return this.t()(
      `${criterion} cubierto por ${task.id}${commit}, ${verdict.es}`,
      `${criterion} covered by ${task.id}${commit}, ${verdict.en}`,
    );
  }
}
