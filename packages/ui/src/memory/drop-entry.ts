// SPDX-License-Identifier: Apache-2.0
import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import type { MemoryEntry } from "@baquia-dev/specty-core";
import { Button } from "../components/button";
import { DialogFrame } from "../components/dialog";
import { Field } from "../components/field";
import { Toasts } from "../components/toast";
import { SpectyData } from "../data/records";
import { reportFailure } from "../review/spec-sections";
import { Preferences } from "../theme/preferences";

/** The entry the person is about to drop. */
export interface DropData {
  readonly entry: MemoryEntry;
}

/**
 * «Descartar P3» (ADR 0016): the entry and the reason, which brings the one of an agent's proposal;
 * dropping is the person's alone, so only a server the person started offers it.
 */
@Component({
  selector: "sp-drop-entry",
  imports: [DialogFrame, Field, Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sp-dialog #frame [heading]="t()('Descartar ' + data.entry.id, 'Drop ' + data.entry.id)" [description]="firstLine">
      <sp-field [label]="t()('Motivo', 'Reason')" [multiline]="true" [(value)]="reason" />
      <p class="m-0 text-xs text-text-muted">
        {{ t()('Queda en la rama con su motivo: specty memory --all la sigue mostrando.', 'It stays in the branch with its reason: specty memory --all still shows it.') }}
      </p>
      <sp-button actions (pressed)="frame.close()">{{ t()('Cancelar', 'Cancel') }}</sp-button>
      <sp-button
        actions
        variant="primary"
        [disabledReason]="reason().trim() ? '' : t()('Escribe el motivo.', 'Write the reason.')"
        (pressed)="drop()"
      >{{ t()('Descartar', 'Drop') }}</sp-button>
    </sp-dialog>
  `,
})
export class DropEntry {
  protected readonly data = inject<DropData>(DIALOG_DATA);
  private readonly ref = inject(DialogRef);
  private readonly source = inject(SpectyData);
  private readonly toasts = inject(Toasts);
  private readonly preferences = inject(Preferences);
  private readonly failed = reportFailure(this.toasts, this.preferences);
  protected readonly t = this.preferences.t;
  protected readonly reason = signal(this.data.entry.drop?.reason ?? "");
  protected readonly firstLine = this.data.entry.text.trim().split("\n")[0] ?? "";

  protected drop(): void {
    const { id } = this.data.entry;
    this.source.memoryAction(id, "drop", this.reason().trim()).then(() => {
      this.ref.close();
      this.toasts.show(this.t()(`${id} descartada.`, `${id} dropped.`), "success");
    }, this.failed);
  }
}
