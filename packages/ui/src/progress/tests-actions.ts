// SPDX-License-Identifier: Apache-2.0
import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { ChangeDetectionStrategy, Component, inject, input } from "@angular/core";
import { Button } from "../components/button";
import { DialogFrame, Dialogs } from "../components/dialog";
import { Toasts } from "../components/toast";
import { Decisions } from "../data/decisions";
import type { ChangeView } from "../data/records";
import { SpectyData } from "../data/records";
import { reportFailure } from "../review/spec-sections";
import { Preferences } from "../theme/preferences";

interface TestsData {
  readonly change: ChangeView;
}

/**
 * Approving the tests is the person's call, the gate 2 of `specty approve` in `testing`, and it
 * locks them: the dialog says so. If the source cannot, a notice says why and the dialog stays.
 */
@Component({
  selector: "sp-approve-tests",
  imports: [DialogFrame, Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sp-dialog #frame [heading]="t()('Aprobar los tests de «' + change.title + '»', 'Approve the tests of “' + change.title + '”')">
      <p class="m-0 text-sm" data-what>{{ what() }}</p>
      <p class="m-0 text-[13px] text-text-muted" data-after>{{ t()('Si algún test no comprueba lo que esperas, díselo al agente antes de aprobar: puede enviarlos de nuevo.', 'If a test does not check what you expect, tell the agent before approving: it can send them again.') }}</p>
      <sp-button actions (pressed)="frame.close()">{{ t()('Cancelar', 'Cancel') }}</sp-button>
      <sp-button actions variant="primary" (pressed)="approve()">{{ t()('Aprobar los tests', 'Approve the tests') }}</sp-button>
    </sp-dialog>
  `,
})
class ApproveTests {
  private readonly data = inject<TestsData>(DIALOG_DATA);
  private readonly ref = inject(DialogRef);
  private readonly source = inject(SpectyData);
  private readonly toasts = inject(Toasts);
  private readonly preferences = inject(Preferences);
  private readonly failed = reportFailure(this.toasts, this.preferences);
  protected readonly t = this.preferences.t;
  protected readonly change = this.data.change;

  /** «Los 2 tests nuevos quedan bloqueados: …»; «El test nuevo» for one. */
  protected what(): string {
    const sent = this.change.tests?.files.length ?? 0;
    const which =
      sent === 1
        ? this.t()("El test nuevo queda bloqueado", "The new test is locked")
        : this.t()(
            `Los ${sent} tests nuevos quedan bloqueados`,
            `The ${sent} new tests are locked`,
          );
    return this.t()(
      `${which}: el agente ya no puede cambiarlos ni borrarlos sin que lo decidas. Después escribe el código que los pone en verde.`,
      `${which}: the agent can no longer change or delete them unless you decide so. Then it writes the code that turns them green.`,
    );
  }

  protected approve(): void {
    this.source.approve(this.change.id, this.change.revision).then(() => {
      this.ref.close();
      this.toasts.show(
        this.t()(
          "Tests aprobados: quedan bloqueados y empieza la implementación.",
          "Tests approved: they are locked and the implementation starts.",
        ),
        "success",
      );
    }, this.failed);
  }
}

/**
 * The decision on the tests the agent sent: approve them. In the page header and, compact, in
 * the sticky bar, as the decision on the closing is.
 */
@Component({
  selector: "sp-tests-actions",
  imports: [Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: "flex flex-wrap gap-2",
    role: "group",
    "[attr.aria-label]": "t()('Decisión sobre los tests', 'Decision on the tests')",
    "[attr.data-compact]": "compact() || null",
  },
  template: `
    <sp-button variant="primary" [size]="compact() ? 'sm' : 'md'" [disabledReason]="decisions.blocked()" (pressed)="open()">{{ t()('Aprobar los tests', 'Approve the tests') }}</sp-button>
  `,
})
export class TestsActions {
  readonly change = input.required<ChangeView>();
  /** In the sticky bar: a small button. */
  readonly compact = input(false);

  protected readonly decisions = inject(Decisions);
  private readonly dialogs = inject(Dialogs);
  protected readonly t = inject(Preferences).t;

  protected open(): void {
    const data: TestsData = { change: this.change() };
    this.dialogs.open(ApproveTests, data);
  }
}
