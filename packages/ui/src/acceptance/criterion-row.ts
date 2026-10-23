// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from "@angular/core";
import {
  LucideCheck,
  LucideCircleCheck,
  LucideCircleDashed,
  LucideCircleDot,
  LucideDynamicIcon,
  LucideGitCommitHorizontal,
  type LucideIconInput,
  LucideTriangleAlert,
  LucideX,
} from "@lucide/angular";
import { REVEAL, ROW } from "../components/document";
import type { CriterionEvidence, EvidenceStatus } from "../data/acceptance";
import { formatDuration, type TaskProgressView } from "../data/progress";
import type { ChangeView } from "../data/records";
import { Preferences } from "../theme/preferences";
import { ResultDialogs } from "./acceptance-actions";

/** A state in words, with its icon and the phase color that reads like it (never color alone). */
export interface Mark {
  readonly icon: LucideIconInput;
  readonly tone: string;
  readonly es: string;
  readonly en: string;
}

const MARKS: Readonly<Record<EvidenceStatus, Mark>> = {
  verified: { icon: LucideCircleCheck, tone: "done", es: "Verificado", en: "Verified" },
  unverified: {
    icon: LucideCircleDashed,
    tone: "draft",
    es: "Hecho, sin verificación",
    en: "Done, not verified",
  },
  pending: { icon: LucideCircleDot, tone: "implementing", es: "Pendiente", en: "Pending" },
  uncovered: { icon: LucideTriangleAlert, tone: "review", es: "Sin tarea", en: "No task" },
};

/** What a task proves for now: its last verification, or how far it got. */
export function verdictOf(task: TaskProgressView): Mark {
  if (task.status === "active")
    return { icon: LucideCircleDot, tone: "implementing", es: "En curso", en: "In progress" };
  if (task.status === "pending")
    return { icon: LucideCircleDashed, tone: "draft", es: "Pendiente", en: "Pending" };
  const run = task.verification;
  if (run === undefined)
    return { icon: LucideCircleDashed, tone: "draft", es: "Sin verificación", en: "Not verified" };
  const es = formatDuration(run.ms, "es");
  const en = formatDuration(run.ms, "en");
  return run.passed
    ? {
        icon: LucideCheck,
        tone: "done",
        es: `Verificación correcta · ${es}`,
        en: `Verification passed · ${en}`,
      }
    : { icon: LucideX, tone: "cancelled", es: `Falló · ${es}`, en: `Failed · ${en}` };
}

/**
 * A criterion as a document row: its text, the tasks that cover it with their commit and last
 * verification, and its state. In acceptance, «No se cumple…» asks for adjustments about it.
 */
@Component({
  selector: "sp-criterion-row",
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: "listitem",
    "[class]": "row",
    "[attr.data-criterion]": "evidence().id",
    "[attr.data-status]": "evidence().status",
  },
  template: `
    <span class="pt-0.5 font-mono text-xs text-text-muted">{{ evidence().id }}</span>
    <div class="flex min-w-0 flex-col gap-2.5">
      <p class="m-0">{{ evidence().text }}</p>
      @if (evidence().tasks.length > 0) {
        <ul class="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px]" [attr.aria-label]="t()('Evidencia de ', 'Evidence for ') + evidence().id" data-evidence>
          @for (task of evidence().tasks; track task.id) {
            <!-- The gap separates them on screen; the spoken spaces, for a screen reader. -->
            <li class="flex flex-wrap items-center gap-x-2.5 gap-y-1" [attr.data-task]="task.id">
              <span class="font-mono text-xs text-text-muted">{{ task.id }}</span>&ngsp;
              <span>{{ task.title }}</span>&ngsp;
              @if (task.commit; as commit) {
                <span class="inline-flex items-center gap-1 font-mono text-xs"><svg [lucideIcon]="commitIcon" size="13" aria-hidden="true"></svg><span class="sr-only">{{ t()('commit', 'commit') }}&ngsp;</span>{{ commit }}</span>&ngsp;
              }
              <span class="inline-flex items-center gap-1.5" [style.color]="'var(--color-phase-' + verdict(task).tone + ')'" data-verdict>
                <svg [lucideIcon]="verdict(task).icon" size="13" aria-hidden="true"></svg>{{ t()(verdict(task).es, verdict(task).en) }}
              </span>
              <!-- Last on the line: while hidden, its room is at the end. -->
              @if (task.commit) {
                &ngsp;<button type="button" [class]="reveal + ' h-6 cursor-pointer border-0 bg-transparent px-1 font-sans text-[13px] whitespace-nowrap text-text underline'" (click)="diff.emit(task.id)" data-show-diff>
                  {{ t()('Ver diff', 'Show diff') }}<span class="sr-only">&ngsp;{{ t()('de', 'of') }} {{ task.id }}</span>
                </button>
              }
            </li>
          }
        </ul>
      }
    </div>
    <!--
      The state and, under it, the action that shows on the row: it adds no height of its own. On
      a phone they sit side by side on the row's first line, next to the id.
    -->
    <div class="flex flex-col items-end gap-1 self-start max-sm:flex-row-reverse max-sm:items-center max-sm:gap-2">
      <span class="flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-medium whitespace-nowrap" [style.color]="'var(--color-phase-' + mark().tone + ')'" [style.background]="'var(--color-phase-' + mark().tone + '-bg)'" data-mark>
        <svg [lucideIcon]="mark().icon" size="13" aria-hidden="true"></svg>{{ t()(mark().es, mark().en) }}
      </span>
      @if (canAdjust()) {
        <button type="button" [class]="reveal + ' h-6 cursor-pointer border-0 bg-transparent px-1 font-sans text-[13px] whitespace-nowrap text-text underline'" (click)="notMet()" data-not-met>
          {{ t()('No se cumple', 'Not met') }}<span class="sr-only">&ngsp;{{ evidence().id }}</span>…
        </button>
      }
    </div>
  `,
})
export class CriterionRow {
  readonly evidence = input.required<CriterionEvidence>();
  readonly change = input.required<ChangeView>();
  /** In acceptance: the criterion can be reported as not met. */
  readonly canAdjust = input(false);
  /** «Ver diff» of a task that backs it: the task's id. */
  readonly diff = output<string>();

  private readonly dialogs = inject(ResultDialogs);
  protected readonly t = inject(Preferences).t;
  protected readonly row = ROW;
  protected readonly reveal = REVEAL;
  protected readonly commitIcon = LucideGitCommitHorizontal;
  protected readonly mark = computed(() => MARKS[this.evidence().status]);
  protected readonly verdict = verdictOf;

  /** «Pedir ajustes» with the request already about this criterion. */
  protected notMet(): void {
    this.dialogs.adjust(this.change(), `${this.evidence().id}: `);
  }
}
