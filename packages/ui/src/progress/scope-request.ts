// SPDX-License-Identifier: Apache-2.0
import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { ChangeDetectionStrategy, Component, inject, input, signal } from "@angular/core";
import { LucideDynamicIcon } from "@lucide/angular";
import { Button } from "../components/button";
import { DialogFrame, Dialogs } from "../components/dialog";
import { Field } from "../components/field";
import { LucideFilePlus } from "../components/icons";
import { Toasts } from "../components/toast";
import { Decisions } from "../data/decisions";
import type { TaskScopeRequest } from "../data/progress";
import { SpectyData } from "../data/records";
import { reportFailure } from "../review/spec-sections";
import { Preferences } from "../theme/preferences";

interface RejectData {
  readonly change: string;
  readonly task: string;
  readonly request: TaskScopeRequest;
}

/** The reason is required: the agent reads it, as with a rejected assumption. */
@Component({
  selector: "sp-reject-scope",
  imports: [DialogFrame, Field, Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sp-dialog #frame [heading]="t()('Rechazar ' + data.request.id, 'Reject ' + data.request.id)" [description]="data.task + ' ' + t()('pide', 'asks for') + ' ' + data.request.paths.join(', ')">
      <sp-field [label]="t()('Motivo, para el agente', 'Reason, for the agent')" [multiline]="true" [(value)]="reason" />
      <sp-button actions (pressed)="frame.close()">{{ t()('Cancelar', 'Cancel') }}</sp-button>
      <sp-button
        actions
        variant="primary"
        [disabledReason]="reason().trim() ? '' : t()('Escribe el motivo: el agente lo leerá.', 'Write the reason: the agent will read it.')"
        (pressed)="reject()"
      >
        {{ t()('Rechazar', 'Reject') }}
      </sp-button>
    </sp-dialog>
  `,
})
export class RejectScope {
  protected readonly data = inject<RejectData>(DIALOG_DATA);
  private readonly ref = inject(DialogRef);
  private readonly source = inject(SpectyData);
  private readonly toasts = inject(Toasts);
  private readonly preferences = inject(Preferences);
  private readonly failed = reportFailure(this.toasts, this.preferences);
  protected readonly t = this.preferences.t;
  protected readonly reason = signal("");

  protected reject(): void {
    const { change, request } = this.data;
    this.source.decideScope(change, request.id, "rejected", this.reason().trim()).then(() => {
      this.ref.close();
      this.toasts.show(
        this.t()(`Rechazaste ${request.id}.`, `You rejected ${request.id}.`),
        "success",
      );
    }, this.failed);
  }
}

/**
 * A scope request inside the task that asked for it: the paths, the agent's reason, what deciding
 * means, and the decision. The task waits at the top of the tab until it is decided.
 */
@Component({
  selector: "sp-scope-request",
  imports: [LucideDynamicIcon, Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block" },
  template: `
    <div role="group" [attr.aria-label]="t()('Solicitud de alcance ', 'Scope request ') + request().id" class="flex flex-col gap-2 rounded-xl px-3.5 py-3" style="background: color-mix(in oklab, var(--color-phase-review-bg) 55%, transparent)" data-scope-request>
      <span class="flex items-center gap-1.5 text-[13px] font-semibold" style="color: var(--color-phase-review)">
        <svg [lucideIcon]="icon" size="14" aria-hidden="true"></svg>{{ request().id }} · {{ t()('Solicitud de alcance', 'Scope request') }}
      </span>
      <span class="text-sm">
        {{ task() }} {{ t()('pide', 'asks for') }}
        @for (path of request().paths; track path) {
          <code class="font-mono text-[13px]">{{ path }}</code>
        }: «{{ request().reason }}»
      </span>
      <span class="text-[13px] text-text-muted">
        {{
          t()(
            'Si la apruebas, ' + task() + ' podrá tocarlo y entra en su alcance. Si la rechazas, el agente sigue sin él y lee tu motivo.',
            'If you approve it, ' + task() + ' may touch it and it enters its scope. If you reject it, the agent goes on without it and reads your reason.'
          )
        }}
      </span>
      <div class="flex flex-wrap gap-2">
        <sp-button size="sm" variant="primary" [disabledReason]="decisions.blocked()" (pressed)="approve()">{{ t()('Aprobar', 'Approve') }}</sp-button>
        <sp-button size="sm" [disabledReason]="decisions.blocked()" (pressed)="reject()">{{ t()('Rechazar…', 'Reject…') }}</sp-button>
      </div>
    </div>
  `,
})
export class ScopeRequest {
  readonly change = input.required<string>();
  readonly task = input.required<string>();
  readonly request = input.required<TaskScopeRequest>();

  private readonly source = inject(SpectyData);
  private readonly dialogs = inject(Dialogs);
  private readonly toasts = inject(Toasts);
  private readonly preferences = inject(Preferences);
  private readonly failed = reportFailure(this.toasts, this.preferences);
  protected readonly decisions = inject(Decisions);
  protected readonly t = this.preferences.t;
  protected readonly icon = LucideFilePlus;

  protected approve(): void {
    const { id } = this.request();
    this.source
      .decideScope(this.change(), id, "approved")
      .then(
        () =>
          this.toasts.show(
            this.t()(
              `Aprobaste ${id}: ${this.task()} vuelve a su lugar.`,
              `You approved ${id}: ${this.task()} goes back to its place.`,
            ),
            "success",
          ),
        this.failed,
      );
  }

  protected reject(): void {
    const data: RejectData = { change: this.change(), task: this.task(), request: this.request() };
    this.dialogs.open(RejectScope, data);
  }
}
