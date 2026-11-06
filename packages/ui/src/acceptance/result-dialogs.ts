// SPDX-License-Identifier: Apache-2.0
import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  Injectable,
  inject,
  type Signal,
  signal,
} from "@angular/core";
import type { Lang } from "@baquia-dev/specty-core";
import { Button } from "../components/button";
import { DialogFrame, Dialogs } from "../components/dialog";
import { Field } from "../components/field";
import { Toasts } from "../components/toast";
import { InFlight } from "../data/in-flight";
import type { RunRecord } from "../data/progress";
import type { Bilingual, ChangeView } from "../data/records";
import { SpectyData } from "../data/records";
import { reportFailure } from "../review/spec-sections";
import { Preferences } from "../theme/preferences";

/** Where the full verification stands when deciding; none when the project has no `verify.full`. */
export type FullState = "not-run" | "running" | "passed" | "failed";

export function fullStateOf(change: ChangeView, run: RunRecord | undefined): FullState | undefined {
  const full = change.progress.full;
  if (full === undefined) return undefined;
  if (run !== undefined && run.task === undefined) return "running";
  if (full.last === undefined) return "not-run";
  return full.last.passed ? "passed" : "failed";
}

/**
 * «La verificación completa …»: the line under «Aceptar resultado» and, mostly, the dialog's; in
 * the color of what it says, a pending one muted.
 */
const STATES: Readonly<Record<FullState, Bilingual & { readonly tone?: string }>> = {
  "not-run": { es: "aún no se ha ejecutado.", en: "has not run yet." },
  running: { es: "está corriendo.", en: "is running." },
  passed: { es: "es correcta.", en: "passed.", tone: "var(--color-phase-done)" },
  failed: { es: "falló.", en: "failed.", tone: "var(--color-phase-cancelled)" },
};

/** What the dialog adds where accepting now means more. */
const NOTES: Readonly<Partial<Record<FullState, Bilingual>>> = {
  "not-run": {
    es: "No ejecutaste la verificación completa. Puedes aceptar igual, o",
    en: "You did not run the full verification. You can accept anyway, or",
  },
  failed: {
    es: "La verificación completa falló: revisa su salida antes de aceptar.",
    en: "The full verification failed: check its output before accepting.",
  },
};

/** «La verificación completa es correcta.» in its color, or what the dialog says instead. */
export function fullLine(state: FullState, lang: Lang, inDialog = false) {
  const subject = lang === "es" ? "La verificación completa" : "The full verification";
  const note = inDialog ? NOTES[state]?.[lang] : undefined;
  const text = note ?? `${subject} ${STATES[state][lang]}`;
  return { text, tone: STATES[state].tone ?? "var(--color-text-muted)" };
}

interface ResultData {
  readonly change: ChangeView;
  /** Where the request starts: «AC2: » when it comes from a criterion. */
  readonly request?: string;
  /** The full verification as the actions follow it, live while the dialog is open. */
  readonly full?: Signal<FullState | undefined>;
}

/** A way the agent takes a request: its name and what it does, in each language. */
interface Way {
  readonly es: readonly [string, string];
  readonly en: readonly [string, string];
}

/** How the agent will classify the request (the adjusting card of the CLI, in short). */
const CLASSES: readonly [Way, Way, Way] = [
  {
    es: ["Defecto", "Un criterio no se cumple: añade una tarea de corrección."],
    en: ["Defect", "A criterion is not met: it adds a fix task."],
  },
  {
    es: ["Refinamiento", "Cambia un detalle de un criterio: lo ajusta y añade una tarea."],
    en: ["Refinement", "A detail of a criterion changes: it adjusts it and adds a task."],
  },
  {
    es: [
      "Alcance nuevo",
      "Ningún criterio lo cubre o choca con «Fuera de alcance»: no toca la spec y te propone un cambio aparte.",
    ],
    en: [
      "New scope",
      'No criterion covers it, or it contradicts "Out of scope": it leaves the spec alone and suggests a separate change.',
    ],
  },
];

/** How the agent adjusts an epic, which has no tasks (the adjusting card of an epic, in short). */
const EPIC_WAYS: readonly Way[] = [
  {
    es: [
      "Dividir un corte",
      "Un corte que sale demasiado grande: lo estrecha y añade el resto como cortes nuevos.",
    ],
    en: [
      "Split a slice",
      "A slice that comes out too large: it narrows it and adds the rest as new slices.",
    ],
  },
  {
    es: ["Corte nuevo", "Algo falta o no se cumple: añade un corte que lo cubra."],
    en: ["New slice", "Something is missing or not met: it adds a slice that covers it."],
  },
  CLASSES[2],
];

/** What the dialog says around the request: how it is taken, an example and the notice once sent. */
interface Said {
  readonly description: Bilingual;
  readonly placeholder: Bilingual;
  readonly sent: Bilingual;
}

const TASKS_SAID: Said = {
  description: {
    es: "Escribe qué hay que cambiar, con tus palabras. El agente recibe la petición tal cual y la clasifica:",
    en: "Write what needs to change, in your own words. The agent gets the request as it is and classifies it:",
  },
  placeholder: {
    es: "Por ejemplo: el porcentaje debería mostrar un decimal",
    en: "For example: the percentage should show one decimal",
  },
  sent: {
    es: "Pediste ajustes: el agente los clasificará en specty next.",
    en: "You asked for adjustments: the agent will classify them in specty next.",
  },
};

const EPIC_SAID: Said = {
  description: {
    es: "Escribe qué hay que cambiar, con tus palabras. El agente recibe la petición tal cual y ajusta la épica:",
    en: "Write what needs to change, in your own words. The agent gets the request as it is and adjusts the epic:",
  },
  placeholder: {
    es: "Por ejemplo: C2 sale demasiado grande, divídelo",
    en: "For example: C2 comes out too large, split it",
  },
  sent: {
    es: "Pediste ajustes de la épica: el agente la ajustará en specty next y volverá a tu revisión.",
    en: "You asked to adjust the epic: the agent will adjust it in specty next and send it back for your review.",
  },
};

/**
 * What stays and what comes after: the done tasks of a change; the closed slices of an epic,
 * which goes back to review, and while its slices are implemented, those in progress go on.
 */
function noteOf(change: ChangeView): Bilingual {
  if (change.kind !== "epic") {
    return {
      es: "Las tareas hechas no se tocan: lo nuevo llega como tareas nuevas en Progreso.",
      en: "Done tasks stay as they are: what is new arrives as new tasks in Progress.",
    };
  }
  return change.phase === "implementing"
    ? {
        es: "Los cortes cerrados no se tocan. La épica vuelve a revisión: ningún corte nuevo empieza hasta que apruebes el ajuste, y los que están en curso siguen.",
        en: "Closed slices stay as they are. The epic goes back to review: no new slice starts until you approve the adjustment, and those in progress go on.",
      }
    : {
        es: "Los cortes cerrados no se tocan. La épica vuelve a revisión, y sus cortes nuevos empiezan cuando apruebes el ajuste.",
        en: "Closed slices stay as they are. The epic goes back to review, and its new slices start once you approve the adjustment.",
      };
}

/**
 * The request goes to the agent word for word, as `specty adjust "<request>"` would; for an
 * epic, the dialog tells how an epic is adjusted instead of how a request is classified.
 */
@Component({
  selector: "sp-adjust-result",
  imports: [DialogFrame, Field, Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sp-dialog #frame [heading]="t()('Pedir ajustes', 'Ask for adjustments')" [description]="said.description[lang()]">
      <dl class="m-0 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3.5 gap-y-2 text-sm" data-classes>
        @for (kind of classes; track $index) {
          <dt class="font-semibold">{{ kind[lang()][0] }}</dt>
          <dd class="m-0 text-text-muted">{{ kind[lang()][1] }}</dd>
        }
      </dl>
      <sp-field [label]="t()('Tu petición', 'Your request')" [multiline]="true" [placeholder]="said.placeholder[lang()]" [(value)]="request" />
      <p class="m-0 text-[13px] text-text-muted" data-note>{{ note[lang()] }}</p>
      <sp-button actions (pressed)="frame.close()">{{ t()('Cancelar', 'Cancel') }}</sp-button>
      <sp-button actions variant="primary" [disabledReason]="request().trim() ? '' : t()('Escribe qué hay que ajustar.', 'Write what to adjust.')" (pressed)="send()">
        {{ t()('Enviar al agente', 'Send to the agent') }}
      </sp-button>
    </sp-dialog>
  `,
})
class AdjustResult {
  private readonly data = inject<ResultData>(DIALOG_DATA);
  private readonly ref = inject(DialogRef);
  private readonly source = inject(SpectyData);
  private readonly toasts = inject(Toasts);
  private readonly preferences = inject(Preferences);
  private readonly failed = reportFailure(this.toasts, this.preferences);
  protected readonly t = this.preferences.t;
  protected readonly lang = this.preferences.lang;
  private readonly epic = this.data.change.kind === "epic";
  protected readonly classes = this.epic ? EPIC_WAYS : CLASSES;
  protected readonly said = this.epic ? EPIC_SAID : TASKS_SAID;
  protected readonly note = noteOf(this.data.change);
  protected readonly request = signal(this.data.request ?? "");

  constructor() {
    // Writing the request is what the dialog is for: the dialog's first focus goes to it (the CDK
    // honours `cdkFocusInitial`, and this runs before it), with the caret after «AC2: ».
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    afterNextRender(() => {
      const field = host.querySelector("textarea");
      if (field === null) return;
      field.setAttribute("cdkFocusInitial", "");
      field.setSelectionRange(field.value.length, field.value.length);
    });
  }

  protected send(): void {
    const request = this.request().trim();
    this.source.decideResult(this.data.change.id, { kind: "adjust", request }).then(() => {
      this.ref.close();
      this.toasts.show(this.said.sent[this.lang()], "success");
    }, this.failed);
  }
}

/** Accepting is the person's call: it says what was done and what comes after. */
@Component({
  selector: "sp-accept-result",
  imports: [DialogFrame, Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sp-dialog #frame [heading]="t()('Aceptar «' + change.title + '»', 'Accept “' + change.title + '”')">
      <ul class="m-0 flex list-none flex-col gap-1 p-0 text-sm" data-done>
        @for (task of done; track task.id) {
          <li><span class="font-mono text-xs text-text-muted">{{ task.id }}</span>&ngsp;{{ task.title }}@if (task.commit; as commit) {&ngsp;<span class="font-mono text-xs text-text-muted">{{ commit }}</span>}</li>
        }
      </ul>
      @if (full(); as state) {
        <p class="m-0 text-sm" [style.color]="said(state).tone" data-full-note>
          {{ said(state).text }}
          @if (state === 'not-run') {
            <button type="button" class="h-6 cursor-pointer border-0 bg-transparent px-0.5 font-sans text-sm text-text underline" (click)="runFirst()" data-run-first>{{ t()('ejecutarla antes.', 'run it first.') }}</button>
          }
        </p>
      }
      <p class="m-0 text-[13px] text-text-muted" data-after>{{ after() }}</p>
      <sp-button actions (pressed)="frame.close()">{{ t()('Cancelar', 'Cancel') }}</sp-button>
      <sp-button actions variant="primary" (pressed)="accept()">{{ full() === 'failed' ? t()('Aceptar de todos modos', 'Accept anyway') : t()('Aceptar', 'Accept') }}</sp-button>
    </sp-dialog>
  `,
})
class AcceptResult {
  private readonly data = inject<ResultData>(DIALOG_DATA);
  private readonly ref = inject(DialogRef);
  private readonly source = inject(SpectyData);
  private readonly inFlight = inject(InFlight);
  private readonly toasts = inject(Toasts);
  private readonly preferences = inject(Preferences);
  private readonly failed = reportFailure(this.toasts, this.preferences);
  protected readonly t = this.preferences.t;
  protected readonly change = this.data.change;
  protected readonly quick = this.change.kind === "quick";
  protected readonly done = this.change.progress.tasks.filter((task) => task.status === "done");
  /** Followed while the dialog is open: a run that ends here changes what it says. */
  protected readonly full = computed(() => this.data.full?.());
  protected readonly said = (state: FullState) => fullLine(state, this.preferences.lang(), true);

  protected readonly after = computed(() =>
    this.quick
      ? this.t()(
          "Es un cambio rápido: se cierra al aceptarlo, con el resumen de sus tareas.",
          "It is a quick change: accepting closes it, with the summary of its tasks.",
        )
      : this.t()(
          "Después, el agente redacta el cierre (resumen, desviaciones, decisiones y pendientes) y tú lo confirmas.",
          "Then the agent writes the closing (summary, deviations, decisions and follow-ups) and you confirm it.",
        ),
  );

  /**
   * Accepting can wait minutes for the full verification: the dialog closes at once, and the
   * header follows it until the server answers.
   */
  protected accept(): void {
    this.ref.close();
    const accepting = this.source.decideResult(this.change.id, { kind: "accept" });
    this.inFlight.run(this.change.id, "accept", accepting).then(() => {
      this.toasts.show(
        this.quick
          ? this.t()(
              "Aceptaste el resultado: el cambio está cerrado.",
              "You accepted the result: the change is closed.",
            )
          : this.t()(
              "Aceptaste el resultado: el agente redactará el cierre.",
              "You accepted the result: the agent will write the closing.",
            ),
        "success",
      );
    }, this.failed);
  }

  /** Runs it instead of deciding now: the dialog closes, and the output shows in the tab. */
  protected runFirst(): void {
    this.ref.close();
    this.source.verifyChange(this.change.id).catch(this.failed);
  }
}

/** Opens the decision dialogs; a criterion opens «Pedir ajustes» with its id already written. */
@Injectable({ providedIn: "root" })
export class ResultDialogs {
  private readonly dialogs = inject(Dialogs);

  adjust(change: ChangeView, request?: string): void {
    const data: ResultData = request === undefined ? { change } : { change, request };
    this.dialogs.open(AdjustResult, data);
  }

  accept(change: ChangeView, full?: Signal<FullState | undefined>): void {
    const data: ResultData = full === undefined ? { change } : { change, full };
    this.dialogs.open(AcceptResult, data);
  }
}
