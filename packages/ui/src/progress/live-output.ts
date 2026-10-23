// SPDX-License-Identifier: Apache-2.0
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  type ElementRef,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from "@angular/core";
import {
  formatClock,
  type OutputTone,
  outputSegments,
  type RunRecord,
  type VerificationView,
} from "../data/progress";
import type { Bilingual } from "../data/records";
import { Preferences } from "../theme/preferences";

/**
 * The output in the phase colors, which keep their contrast in both themes: failures read as a
 * cancelled change, passes as a done one, locations as work in progress; timings step back.
 */
export const OUTPUT_TONES: Readonly<Record<OutputTone, string>> = {
  plain: "",
  muted: "text-text-muted",
  pass: "text-phase-done",
  fail: "text-phase-cancelled",
  path: "text-phase-implementing",
};

interface Wording {
  /** The name of the output region. */
  readonly log: Bilingual;
  readonly start: Bilingual;
  readonly end: Bilingual;
  readonly passed: Bilingual;
  readonly failed: Bilingual;
}

/** What the output and its announcements say of a task's runs, or of the full verification's. */
function wording(task: string | undefined): Wording {
  if (task === undefined) {
    return {
      log: {
        es: "Salida en vivo de la verificación completa",
        en: "Live output of the full verification",
      },
      start: { es: "Verificando todo el cambio", en: "Verifying the whole change" },
      end: { es: "Terminó la verificación completa.", en: "The full verification ended." },
      passed: { es: "La verificación completa fue correcta.", en: "The full verification passed." },
      failed: { es: "La verificación completa falló.", en: "The full verification failed." },
    };
  }
  return {
    log: { es: `Salida en vivo de ${task}`, en: `Live output of ${task}` },
    start: { es: `Verificando ${task}`, en: `Verifying ${task}` },
    end: { es: `Terminó la verificación de ${task}.`, en: `The verification of ${task} ended.` },
    passed: {
      es: `La verificación de ${task} fue correcta.`,
      en: `The verification of ${task} passed.`,
    },
    failed: { es: `La verificación de ${task} falló.`, en: `The verification of ${task} failed.` },
  };
}

/** The system's timing for things that enter; `--duration-base` is 0 ms with reduced motion. */
const MOTION =
  "transition-duration: var(--duration-base); transition-timing-function: var(--ease-standard)";

/** Enough to read what failed; older lines are counted, not kept on screen. */
export const MAX_LINES = 500;
/** Closer than this to the end, the output counts as followed. */
const END_PX = 8;

/**
 * The output of the verification running on a task, as it arrives (docs/ui.md, Progreso): it
 * follows the last line unless the person scrolls up to read. It stays mounted on the task in
 * progress, so its status region can tell when a run starts and how it ended.
 */
@Component({
  selector: "sp-live-output",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block" },
  template: `
    <p class="sr-only" role="status" data-announce>{{ message() }}</p>
    @if (run(); as run) {
      <!-- It comes in from a little above, and its output opens from the top: with reduced motion, the token is 0 ms. -->
      <div class="flex flex-col gap-2 transition-[opacity,translate] starting:-translate-y-1 starting:opacity-0" [style]="motion" data-live>
        <div class="flex flex-wrap items-center gap-2 text-[13px]">
          <span class="inline-flex items-center gap-2" style="color: var(--color-phase-implementing)">
            <span class="size-2 animate-pulse rounded-full motion-reduce:animate-none" style="background: var(--color-phase-implementing)" aria-hidden="true"></span>
            {{ t()('Verificando', 'Verifying') }} · <span class="font-mono tabular-nums" data-clock>{{ clock() }}</span>
          </span>&ngsp;
          <code class="font-mono text-xs text-text-muted">{{ run.command }}</code>&ngsp;
          <button type="button" class="h-6 cursor-pointer border-0 bg-transparent px-1 font-sans text-[13px] text-text underline" [attr.aria-expanded]="shown()" (click)="shown.set(!shown())" data-toggle>
            {{ shown() ? t()('Ocultar salida', 'Hide output') : t()('Ver salida en vivo', 'Show live output') }}
          </button>
        </div>
        @if (shown()) {
          <div class="relative">
            <!--
              The same height from the first line, so the page does not move as lines arrive; they
              scroll inside, and at its ends the scroll stays in the box.
              Inside <pre> every space of the template shows: the lines go on one template line.
            -->
            <pre #log tabindex="0" class="m-0 h-72 overflow-y-auto overscroll-contain rounded-lg border border-border bg-text/5 px-3 py-2.5 font-mono text-xs leading-relaxed whitespace-pre-wrap transition-[height,opacity] starting:h-0 starting:opacity-0" [style]="motion" [attr.aria-label]="t()(said().log.es, said().log.en)" (scroll)="onScroll()" data-log>@if (hidden() > 0) {<span class="block text-text-muted" data-hidden>{{ t()('… ' + hidden() + ' líneas antes', '… ' + hidden() + ' earlier lines') }}</span>}@for (line of lines(); track $index) {<span class="block">@for (part of line; track $index) {<span [class]="tones[part.tone]" [attr.data-tone]="part.tone">{{ part.text }}</span>}</span>}</pre>
            @if (!following()) {
              <button type="button" class="absolute right-3 bottom-3 h-8 cursor-pointer rounded-lg border border-border bg-surface px-3 font-sans text-[13px] font-medium text-text shadow-sm" (click)="toEnd()" data-to-end>{{ t()('Ir al final', 'Go to the end') }}</button>
            }
          </div>
        }
      </div>
    }
  `,
})
export class LiveOutput {
  /** The task the runs check; none for the full verification of the change. */
  readonly task = input<string | undefined>(undefined);
  /** The run on this task, while there is one. */
  readonly run = input<RunRecord | undefined>(undefined);
  /** The task's last verification, to tell how a run ended once its result arrives. */
  readonly verification = input<VerificationView | undefined>(undefined);

  private readonly preferences = inject(Preferences);
  protected readonly t = this.preferences.t;
  protected readonly tones = OUTPUT_TONES;
  protected readonly motion = MOTION;
  /** Open while it runs, unless the person hides it. */
  protected readonly shown = signal(true);
  /** At the end of the output: new lines keep it there. */
  protected readonly following = signal(true);
  protected readonly message = signal("");
  private readonly now = signal(Date.now());
  private readonly log = viewChild<ElementRef<HTMLElement>>("log");

  protected readonly lines = computed(() =>
    (this.run()?.output ?? []).slice(-MAX_LINES).map((line) => outputSegments(line)),
  );
  protected readonly hidden = computed(() =>
    Math.max(0, (this.run()?.output.length ?? 0) - MAX_LINES),
  );
  protected readonly clock = computed(() => {
    const run = this.run();
    return run === undefined ? "" : formatClock(this.now() - Date.parse(run.startedAt));
  });
  protected readonly said = computed(() => wording(this.task()));

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
    // New lines bring the output to its end, unless the person is reading higher up.
    afterRenderEffect(() => {
      this.lines();
      const log = this.log()?.nativeElement;
      if (log !== undefined && untracked(this.following)) log.scrollTop = log.scrollHeight;
    });
    // A run starting, ending, and its result: announced once each, never line by line.
    let running = false;
    let awaiting = false;
    let lastAt: string | undefined;
    effect(() => {
      const run = this.run();
      const result = this.verification();
      untracked(() => {
        const lang = this.preferences.lang();
        const said = this.said();
        if (run !== undefined && !running) {
          this.message.set(`${said.start[lang]}: ${run.command}.`);
        } else if (run === undefined && running) {
          awaiting = true;
          this.message.set(said.end[lang]);
        } else if (awaiting && result !== undefined && result.at !== lastAt) {
          awaiting = false;
          this.message.set((result.passed ? said.passed : said.failed)[lang]);
        }
        running = run !== undefined;
        lastAt = result?.at;
      });
    });
  }

  /** Scrolling up to read stops following; back at the end, it follows again. */
  protected onScroll(): void {
    const log = this.log()?.nativeElement;
    if (log === undefined) return;
    this.following.set(log.scrollHeight - log.scrollTop - log.clientHeight <= END_PX);
  }

  /** Back to the last line, following it again; the focus moves to the output it leaves. */
  protected toEnd(): void {
    this.following.set(true);
    const log = this.log()?.nativeElement;
    if (log === undefined) return;
    log.scrollTop = log.scrollHeight;
    log.focus();
  }
}
