// SPDX-License-Identifier: Apache-2.0
import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { ChangeDetectionStrategy, Component, computed, inject, input } from "@angular/core";
import { Button } from "../components/button";
import { DialogFrame, Dialogs } from "../components/dialog";
import { Toasts } from "../components/toast";
import { Decisions } from "../data/decisions";
import { InFlight } from "../data/in-flight";
import type { ChangeView } from "../data/records";
import { SpectyData } from "../data/records";
import { reportFailure } from "../review/spec-sections";
import { Preferences } from "../theme/preferences";

interface ClosingData {
  readonly change: ChangeView;
}

/**
 * Confirming the closing is the person's call, as `specty close` in the terminal, and it has no
 * way back: the dialog says so. Confirming can wait minutes for the full verification, so the
 * dialog closes at once and the header follows the closing until the server answers; then a
 * notice says how it ended.
 */
@Component({
  selector: "sp-confirm-closing",
  imports: [DialogFrame, Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sp-dialog #frame [heading]="t()('Confirmar el cierre de «' + change.title + '»', 'Confirm the closing of “' + change.title + '”')">
      <p class="m-0 text-sm" data-what>
        {{ t()('El cambio termina y se archiva con su cierre: el resumen, las desviaciones, las decisiones y los pendientes quedan en su historia.', 'The change ends and is archived with its closing: the summary, the deviations, the decisions and the follow-ups stay in its history.') }}
      </p>
      <p class="m-0 text-[13px] text-text-muted" data-after>{{ t()('No se puede deshacer: para seguir con algo pendiente, se abre un cambio nuevo.', 'It cannot be undone: to go on with a follow-up, a new change is opened.') }}</p>
      <sp-button actions (pressed)="frame.close()">{{ t()('Cancelar', 'Cancel') }}</sp-button>
      <sp-button actions variant="primary" (pressed)="confirm()">{{ t()('Confirmar y archivar', 'Confirm and archive') }}</sp-button>
    </sp-dialog>
  `,
})
class ConfirmClosing {
  private readonly data = inject<ClosingData>(DIALOG_DATA);
  private readonly ref = inject(DialogRef);
  private readonly source = inject(SpectyData);
  private readonly inFlight = inject(InFlight);
  private readonly toasts = inject(Toasts);
  private readonly preferences = inject(Preferences);
  private readonly failed = reportFailure(this.toasts, this.preferences);
  protected readonly t = this.preferences.t;
  protected readonly change = this.data.change;

  protected confirm(): void {
    this.ref.close();
    const closing = this.source.confirmClosing(this.change.id);
    this.inFlight.run(this.change.id, "close", closing).then(() => {
      this.toasts.show(
        this.t()(
          "Cierre confirmado: el cambio está terminado y archivado.",
          "Closing confirmed: the change is done and archived.",
        ),
        "success",
      );
    }, this.failed);
  }
}

/**
 * The decision on the closing the agent sent: confirm and archive. In the page header and,
 * compact, in the sticky bar, as the decision on the result is in acceptance. While a closing this
 * tab sent waits for the server, the button loads and, in the header, a line under it says so:
 * why the server makes it wait, once it said so, or «Cerrando…».
 */
@Component({
  selector: "sp-closing-actions",
  imports: [Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: "flex flex-col items-end gap-1.5 max-lg:items-start",
    role: "group",
    "[attr.aria-label]": "t()('Decisión sobre el cierre', 'Decision on the closing')",
    "[attr.data-compact]": "compact() || null",
  },
  template: `
    <sp-button variant="primary" [size]="compact() ? 'sm' : 'md'" [disabledReason]="decisions.blocked()" [loading]="closing()" (pressed)="open()">{{ t()('Confirmar y archivar', 'Confirm and archive') }}</sp-button>
    @if (!compact() && closing()) {
      <p class="m-0 text-xs text-text-muted" data-in-flight>{{ running()?.note ?? t()('Cerrando…', 'Closing…') }}</p>
    }
  `,
})
export class ClosingActions {
  readonly change = input.required<ChangeView>();
  /** In the sticky bar: a small button, and no line under it. */
  readonly compact = input(false);

  protected readonly decisions = inject(Decisions);
  private readonly dialogs = inject(Dialogs);
  private readonly inFlight = inject(InFlight);
  protected readonly t = inject(Preferences).t;
  /** The closing this tab sent that the server has not answered, with what it said of it. */
  protected readonly running = computed(() => {
    const action = this.inFlight.of(this.change().id);
    return action?.kind === "close" ? action : undefined;
  });
  protected readonly closing = computed(() => this.running() !== undefined);

  protected open(): void {
    const data: ClosingData = { change: this.change() };
    this.dialogs.open(ConfirmClosing, data);
  }
}
