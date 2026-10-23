// SPDX-License-Identifier: Apache-2.0
import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  Injectable,
  inject,
  input,
  signal,
} from "@angular/core";
import { Button } from "../components/button";
import { DialogFrame, Dialogs } from "../components/dialog";
import { Field } from "../components/field";
import { Toasts } from "../components/toast";
import type { ChangeView } from "../data/records";
import { SpectyData } from "../data/records";
import { reportFailure } from "../review/spec-sections";
import { Preferences } from "../theme/preferences";

interface ResultData {
  readonly change: ChangeView;
  /** Where the request starts: «AC2: » when it comes from a criterion. */
  readonly request?: string;
}

/** How the agent will classify the request (the adjusting card of the CLI, in short). */
const CLASSES = [
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
] as const;

/** The request goes to the agent word for word, as `specty adjust "<request>"` would. */
@Component({
  selector: "sp-adjust-result",
  imports: [DialogFrame, Field, Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sp-dialog #frame [heading]="t()('Pedir ajustes', 'Ask for adjustments')" [description]="t()('Escribe qué hay que cambiar, con tus palabras. El agente recibe la petición tal cual y la clasifica:', 'Write what needs to change, in your own words. The agent gets the request as it is and classifies it:')">
      <dl class="m-0 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3.5 gap-y-2 text-sm" data-classes>
        @for (kind of classes; track $index) {
          <dt class="font-semibold">{{ kind[lang()][0] }}</dt>
          <dd class="m-0 text-text-muted">{{ kind[lang()][1] }}</dd>
        }
      </dl>
      <sp-field [label]="t()('Tu petición', 'Your request')" [multiline]="true" [placeholder]="t()('Por ejemplo: el porcentaje debería mostrar un decimal', 'For example: the percentage should show one decimal')" [(value)]="request" />
      <p class="m-0 text-[13px] text-text-muted">{{ t()('Las tareas hechas no se tocan: lo nuevo llega como tareas nuevas en Progreso.', 'Done tasks stay as they are: what is new arrives as new tasks in Progress.') }}</p>
      <sp-button actions (pressed)="frame.close()">{{ t()('Cancelar', 'Cancel') }}</sp-button>
      <sp-button actions variant="primary" [disabledReason]="request().trim() ? '' : t()('Escribe qué hay que ajustar.', 'Write what to adjust.')" (pressed)="send()">
        {{ t()('Enviar al agente', 'Send to the agent') }}
      </sp-button>
    </sp-dialog>
  `,
})
export class AdjustResult {
  private readonly data = inject<ResultData>(DIALOG_DATA);
  private readonly ref = inject(DialogRef);
  private readonly source = inject(SpectyData);
  private readonly toasts = inject(Toasts);
  private readonly preferences = inject(Preferences);
  private readonly failed = reportFailure(this.toasts, this.preferences);
  protected readonly t = this.preferences.t;
  protected readonly lang = this.preferences.lang;
  protected readonly classes = CLASSES;
  protected readonly request = signal(this.data.request ?? "");

  protected send(): void {
    const request = this.request().trim();
    this.source.decideResult(this.data.change.id, { kind: "adjust", request }).then(() => {
      this.ref.close();
      this.toasts.show(
        this.t()(
          "Pediste ajustes: el agente los clasificará en specty next.",
          "You asked for adjustments: the agent will classify them in specty next.",
        ),
        "success",
      );
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
      <p class="m-0 text-[13px] text-text-muted" data-after>{{ after() }}</p>
      <sp-button actions (pressed)="frame.close()">{{ t()('Cancelar', 'Cancel') }}</sp-button>
      <sp-button actions variant="primary" (pressed)="accept()">{{ t()('Aceptar', 'Accept') }}</sp-button>
    </sp-dialog>
  `,
})
export class AcceptResult {
  private readonly data = inject<ResultData>(DIALOG_DATA);
  private readonly ref = inject(DialogRef);
  private readonly source = inject(SpectyData);
  private readonly toasts = inject(Toasts);
  private readonly preferences = inject(Preferences);
  private readonly failed = reportFailure(this.toasts, this.preferences);
  protected readonly t = this.preferences.t;
  protected readonly change = this.data.change;
  protected readonly quick = this.change.kind === "quick";
  protected readonly done = this.change.progress.tasks.filter((task) => task.status === "done");

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

  protected accept(): void {
    this.source.decideResult(this.change.id, { kind: "accept" }).then(() => {
      this.ref.close();
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
}

/** Opens the decision dialogs; a criterion opens «Pedir ajustes» with its id already written. */
@Injectable({ providedIn: "root" })
export class ResultDialogs {
  private readonly dialogs = inject(Dialogs);

  adjust(change: ChangeView, request?: string): void {
    const data: ResultData = request === undefined ? { change } : { change, request };
    this.dialogs.open(AdjustResult, data);
  }

  accept(change: ChangeView): void {
    const data: ResultData = { change };
    this.dialogs.open(AcceptResult, data);
  }
}

/**
 * The decision on the result: ask for adjustments or accept. In the page header and, compact, in
 * the sticky bar, as the decision on the spec is in review.
 */
@Component({
  selector: "sp-acceptance-actions",
  imports: [Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: "flex gap-2",
    role: "group",
    "[attr.aria-label]": "t()('Decisión sobre el resultado', 'Decision on the result')",
    "[attr.data-compact]": "compact() || null",
  },
  template: `
    <sp-button [size]="compact() ? 'sm' : 'md'" (pressed)="dialogs.adjust(change())">{{ t()('Pedir ajustes…', 'Ask for adjustments…') }}</sp-button>
    <sp-button variant="primary" [size]="compact() ? 'sm' : 'md'" (pressed)="dialogs.accept(change())">{{ t()('Aceptar resultado', 'Accept result') }}</sp-button>
  `,
})
export class AcceptanceActions {
  readonly change = input.required<ChangeView>();
  /** In the sticky bar: small buttons. */
  readonly compact = input(false);

  protected readonly dialogs = inject(ResultDialogs);
  protected readonly t = inject(Preferences).t;
}
