// SPDX-License-Identifier: Apache-2.0
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
} from "@angular/core";
import { LucideDynamicIcon } from "@lucide/angular";
import { Button } from "../components/button";
import { SectionDivider } from "../components/document";
import { LucideCheck, LucideCircleDashed, LucidePlay, LucideX } from "../components/icons";
import { Toasts } from "../components/toast";
import { Decisions } from "../data/decisions";
import {
  type FullVerificationView,
  formatDuration,
  outputSegments,
  type RunRecord,
} from "../data/progress";
import { type ChangeView, relativeTime, SpectyData } from "../data/records";
import { LiveOutput, OUTPUT_TONES } from "../progress/live-output";
import { reportFailure } from "../review/spec-sections";
import { Preferences } from "../theme/preferences";

const TICK_MS = 30_000;

/**
 * The full verification of the change (`verify.full`, docs/ui.md, Aceptación): its last result,
 * or its output live while it runs, as a task's in Progress. In acceptance it can be run again.
 */
@Component({
  selector: "sp-full-verification",
  imports: [LucideDynamicIcon, Button, SectionDivider, LiveOutput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block" },
  template: `
    <section aria-labelledby="full-verification">
      <!-- The command beside the title; on a phone, too long for it: it goes under, by the state. -->
      <sp-section-divider class="max-sm:**:data-meta:hidden" [heading]="t()('Verificación completa', 'Full verification')" headingId="full-verification" [meta]="full().command" [level]="2" />
      <div class="mt-3 flex flex-col gap-2.5">
        <!-- Always there, so its status region can tell when a run starts and how it ended. -->
        <sp-live-output [run]="live()" [verification]="full().last" />
        @if (!live()) {
          <code class="font-mono text-xs text-text-muted sm:hidden" data-command>{{ full().command }}</code>
          <div class="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm" data-full-status>
            @if (full().last; as last) {
              <span class="inline-flex items-center gap-1.5" [style.color]="last.passed ? 'var(--color-phase-done)' : 'var(--color-phase-cancelled)'" data-verdict>
                <svg [lucideIcon]="last.passed ? passIcon : failIcon" size="14" aria-hidden="true"></svg>{{ verdict() }}
              </span>&ngsp;
              @if (last.output.length > 0) {
                <button type="button" class="h-6 cursor-pointer border-0 bg-transparent px-1 font-sans text-[13px] text-text underline" [attr.aria-expanded]="open()" (click)="open.set(!open())" data-toggle-output>
                  {{ open() ? t()('Ocultar salida', 'Hide output') : t()('Ver salida', 'Show output') }}
                </button>&ngsp;
              }
            } @else {
              <span class="inline-flex items-center gap-1.5 text-text-muted" data-verdict>
                <svg [lucideIcon]="notRunIcon" size="14" aria-hidden="true"></svg>{{ t()('Sin ejecutar', 'Not run') }}
              </span>&ngsp;
              <span class="text-text-muted">{{ t()('Corre todos los tests del proyecto, no solo los de cada tarea.', "It runs every test in the project, not only each task's.") }}</span>&ngsp;
            }
            @if (change().phase === 'acceptance') {
              <sp-button size="sm" [disabledReason]="decisions.blocked()" (pressed)="run()" data-run>
                <svg [lucideIcon]="runIcon" size="12" aria-hidden="true"></svg>
                {{ full().last ? t()('Ejecutar de nuevo', 'Run again') : t()('Ejecutar', 'Run') }}
              </sp-button>
            }
          </div>
          @if (open() && output().length > 0) {
            <!-- Inside <pre> every space of the template shows: the lines go on one template line. -->
            <pre class="m-0 rounded-lg border border-border bg-text/5 px-3 py-2.5 font-mono text-xs leading-relaxed whitespace-pre-wrap" data-output>@for (line of output(); track $index) {<span class="block">@for (part of line; track $index) {<span [class]="tones[part.tone]" [attr.data-tone]="part.tone">{{ part.text }}</span>}</span>}</pre>
          }
        }
      </div>
    </section>
  `,
})
export class FullVerification {
  readonly change = input.required<ChangeView>();
  readonly full = input.required<FullVerificationView>();

  private readonly source = inject(SpectyData);
  private readonly preferences = inject(Preferences);
  protected readonly decisions = inject(Decisions);
  private readonly failed = reportFailure(inject(Toasts), this.preferences);
  protected readonly t = this.preferences.t;
  protected readonly tones = OUTPUT_TONES;
  protected readonly passIcon = LucideCheck;
  protected readonly failIcon = LucideX;
  protected readonly notRunIcon = LucideCircleDashed;
  protected readonly runIcon = LucidePlay;
  private readonly now = signal(Date.now());
  /** The run streaming in this change; a task's belongs to Progress. */
  private readonly streaming = signal<RunRecord | undefined>(undefined);
  protected readonly live = computed(() => {
    const run = this.streaming();
    return run?.task === undefined ? run : undefined;
  });

  /** A failure's last lines start open; a new result sets it again, the person's choice stays. */
  protected readonly open = linkedSignal<string, boolean>({
    source: () => this.full().last?.at ?? "",
    computation: () => this.full().last?.passed === false,
  });
  protected readonly output = computed(() =>
    (this.full().last?.output ?? []).map((line) => outputSegments(line)),
  );

  /** «Correcta · 41 s · hace 2 min» or «Falló · 9 s · hace 2 min». */
  protected readonly verdict = computed(() => {
    const last = this.full().last;
    if (last === undefined) return "";
    const lang = this.preferences.lang();
    const took = formatDuration(last.ms, lang);
    const when = relativeTime(last.at, this.now(), lang);
    return last.passed
      ? this.t()(`Correcta · ${took} · ${when}`, `Passed · ${took} · ${when}`)
      : this.t()(`Falló · ${took} · ${when}`, `Failed · ${took} · ${when}`);
  });

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), TICK_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
    const id = computed(() => this.change().id);
    effect((onCleanup) => {
      onCleanup(this.source.watchRun(id(), (run) => this.streaming.set(run)));
    });
  }

  /** Starts it; the source says why when it cannot. */
  protected run(): void {
    this.source.verifyChange(this.change().id).catch(this.failed);
  }
}
