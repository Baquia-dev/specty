// SPDX-License-Identifier: Apache-2.0
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
} from "@angular/core";
import { LucideDynamicIcon, type LucideIconInput } from "@lucide/angular";
import { ROW } from "../components/document";
import {
  LucideCheck,
  LucideCircleCheck,
  LucideCircleDashed,
  LucideCircleDot,
  LucideGitCommitHorizontal,
  LucideX,
} from "../components/icons";
import {
  formatDuration,
  outputSegments,
  type TaskProgressView,
  type TaskStatus,
  taskElapsed,
} from "../data/progress";
import { relativeTime } from "../data/records";
import { Preferences } from "../theme/preferences";
import { OUTPUT_TONES } from "./live-output";

/** Each state with its icon and the phase color that reads like it (never color alone). */
const MARKS: Readonly<
  Record<
    TaskStatus,
    {
      readonly icon: LucideIconInput;
      readonly tone: string;
      readonly es: string;
      readonly en: string;
    }
  >
> = {
  done: { icon: LucideCircleCheck, tone: "done", es: "Hecha", en: "Done" },
  active: { icon: LucideCircleDot, tone: "implementing", es: "En curso", en: "In progress" },
  pending: { icon: LucideCircleDashed, tone: "draft", es: "Pendiente", en: "Pending" },
};

/** A row arriving (back in the list, or up to «Te espera») fades in; still with reduced motion. */
const ENTER =
  "transition-[opacity,translate] duration-200 starting:-translate-y-1 starting:opacity-0 motion-reduce:transition-none";

/**
 * One task as a document row: its state, what it left (summary, commit), what it touches (files,
 * criteria), how long it took and its last verification. A failure keeps its last lines.
 */
@Component({
  selector: "sp-task-row",
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: "listitem",
    "[class]": "task().status === 'active' ? row + ' bg-text/4' : row",
    "[attr.data-task]": "task().id",
    "[attr.data-status]": "task().status",
  },
  template: `
    <span class="pt-0.5 font-mono text-xs text-text-muted">{{ task().id }}</span>
    <div class="flex min-w-0 flex-col gap-1.5">
      <span [class]="task().status === 'pending' ? 'font-semibold text-text-muted' : 'font-semibold'">{{ task().title }}</span>
      @if (task().summary; as summary) {
        <span class="text-sm text-text-muted" data-summary>{{ summary }}</span>
      }
      @if (running(); as since) {
        <span class="flex items-center gap-2 text-[13px]" style="color: var(--color-phase-implementing)" data-running>
          <span class="size-1.5 rounded-full" style="background: var(--color-phase-implementing); box-shadow: 0 0 0 4px var(--color-phase-implementing-bg)" aria-hidden="true"></span>
          {{ since }}
        </span>
      }
      <!-- The gap separates them on screen; the spoken spaces, for a screen reader. -->
      <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px] text-text-muted" data-meta>
        @if (task().commit; as commit) {
          <span class="inline-flex items-center gap-1 font-mono text-xs text-text"><svg [lucideIcon]="commitIcon" size="13" aria-hidden="true"></svg><span class="sr-only">{{ t()('commit', 'commit') }}&ngsp;</span>{{ commit }}</span>&ngsp;
        }
        @for (file of task().files; track file) {
          <code class="rounded-md bg-text/5 px-1.5 font-mono text-xs">{{ file }}</code>&ngsp;
        }
        @for (criterion of task().criteria; track criterion) {
          <span class="rounded-md border border-border px-1.5 font-mono text-xs">{{ criterion }}</span>&ngsp;
        }
        @if (duration(); as took) {
          <span data-duration>{{ took }}</span>&ngsp;
        }
        @if (task().attempts > 1) {
          <span data-attempts>{{ task().attempts }} {{ t()('intentos', 'attempts') }}</span>
        }
      </div>
      @if (task().verification; as run) {
        <div class="flex flex-wrap items-center gap-2 text-[13px]" data-verification>
          <span class="inline-flex items-center gap-1.5" [style.color]="run.passed ? 'var(--color-phase-done)' : 'var(--color-phase-cancelled)'">
            <svg [lucideIcon]="run.passed ? passIcon : failIcon" size="14" aria-hidden="true"></svg>{{ verdict() }}
          </span>
          <code class="font-mono text-xs text-text-muted">{{ run.command }}</code>
          @if (run.output.length > 0) {
            <button type="button" class="h-6 cursor-pointer border-0 bg-transparent px-1 font-sans text-[13px] text-text underline" [attr.aria-expanded]="open()" (click)="open.set(!open())">
              {{ open() ? t()('Ocultar salida', 'Hide output') : t()('Ver salida', 'Show output') }}
            </button>
          }
        </div>
        @if (open() && run.output.length > 0) {
          <!-- Inside <pre> every space of the template shows: the lines go on one template line. -->
          <pre class="m-0 rounded-lg border border-border bg-text/5 px-3 py-2.5 font-mono text-xs leading-relaxed whitespace-pre-wrap" data-output>@for (line of output(); track $index) {<span class="block">@for (part of line; track $index) {<span [class]="tones[part.tone]" [attr.data-tone]="part.tone">{{ part.text }}</span>}</span>}</pre>
        }
      }
      <ng-content />
    </div>
    <span class="flex h-6 items-center gap-1 self-start rounded-full px-2.5 text-xs font-medium whitespace-nowrap" [style.color]="'var(--color-phase-' + mark().tone + ')'" [style.background]="'var(--color-phase-' + mark().tone + '-bg)'" data-mark>
      <svg [lucideIcon]="mark().icon" size="13" aria-hidden="true"></svg>{{ t()(mark().es, mark().en) }}
    </span>
  `,
})
export class TaskRow {
  readonly task = input.required<TaskProgressView>();
  /** The clock of the tab, so durations move on. */
  readonly now = input(Date.now());
  /** A new verification of this task is running: the last failure folds out of its way. */
  readonly live = input(false);

  private readonly preferences = inject(Preferences);
  protected readonly t = this.preferences.t;
  protected readonly row = `${ROW} ${ENTER}`;
  protected readonly commitIcon = LucideGitCommitHorizontal;
  protected readonly passIcon = LucideCheck;
  protected readonly failIcon = LucideX;
  protected readonly mark = computed(() => MARKS[this.task().status]);

  /**
   * The output starts open on a failure of the task in progress, and folded while a new one runs.
   * A new result or run sets it again; live updates of the same one keep what the person chose.
   */
  protected readonly open = linkedSignal<string, boolean>({
    source: () => `${this.task().verification?.at ?? ""}|${this.live()}`,
    computation: (key, previous) => {
      if (previous !== undefined && previous.source === key) return previous.value;
      const run = this.task().verification;
      return this.task().status === "active" && !this.live() && run !== undefined && !run.passed;
    },
  });

  /** The last lines of a failed run, each in pieces with the tone of what they say. */
  protected readonly output = computed(() =>
    (this.task().verification?.output ?? []).map((line) => outputSegments(line)),
  );
  protected readonly tones = OUTPUT_TONES;

  /** «En curso · empezó hace 12 min». */
  protected readonly running = computed(() => {
    const { status, startedAt } = this.task();
    if (status !== "active") return undefined;
    if (startedAt === undefined) return this.t()("En curso", "In progress");
    const since = relativeTime(startedAt, this.now(), this.preferences.lang());
    return this.t()(`En curso · empezó ${since}`, `In progress · started ${since}`);
  });

  /** How long a done task took. */
  protected readonly duration = computed(() => {
    if (this.task().status !== "done") return undefined;
    const took = taskElapsed(this.task(), this.now());
    return took === undefined ? undefined : formatDuration(took, this.preferences.lang());
  });

  /** «Verificación correcta · 18 s» or «Falló hace 4 min · 7 s». */
  protected readonly verdict = computed(() => {
    const run = this.task().verification;
    if (run === undefined) return "";
    const lang = this.preferences.lang();
    const took = formatDuration(run.ms, lang);
    if (run.passed)
      return this.t()(`Verificación correcta · ${took}`, `Verification passed · ${took}`);
    const when = relativeTime(run.at, this.now(), lang);
    return this.t()(`Falló ${when} · ${took}`, `Failed ${when} · ${took}`);
  });
}
