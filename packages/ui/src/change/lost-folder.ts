// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, inject, input, signal } from "@angular/core";
import { Button } from "../components/button";
import { Toasts } from "../components/toast";
import { Decisions } from "../data/decisions";
import type { ChangeView } from "../data/records";
import { SpectyData } from "../data/records";
import { reportFailure } from "../review/spec-sections";
import { Preferences } from "../theme/preferences";

/**
 * An open change whose folder is gone: what happened, «Recuperar carpeta», which does what
 * `specty restore` does through the local server, and that command for the terminal. Its files
 * are only on its branch, so the page shows this instead of its tabs (ARCHITECTURE §9).
 */
@Component({
  selector: "sp-lost-folder",
  imports: [Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="flex flex-col gap-3 pt-4" [attr.aria-label]="t()('Carpeta perdida', 'Lost folder')">
      <p class="m-0 text-sm" data-what>
        {{ t()('La carpeta de este cambio se perdió: alguien la borró o git la podó. El cambio sigue en su rama, desde la que se recupera; lo que no estaba confirmado en la rama cuando se perdió no vuelve.', 'This change’s folder was lost: someone deleted it or git pruned it. The change is still on its branch, which brings it back; what was not committed on the branch when it was lost does not come back.') }}
      </p>
      <div class="flex flex-wrap items-center gap-3">
        <sp-button variant="primary" [loading]="loading()" [disabledReason]="decisions.blocked()" (pressed)="restore()">
          {{ t()('Recuperar carpeta', 'Restore folder') }}
        </sp-button>
      </div>
      @if (decisions.blocked(); as reason) {
        <p class="m-0 text-[13px] text-text-muted" data-blocked>{{ reason }}</p>
      }
      <p class="m-0 text-[13px] text-text-muted" data-command>
        {{ t()('En la terminal:', 'In the terminal:') }}
        <code class="font-mono text-xs">specty restore {{ change().id }}</code>
      </p>
    </section>
  `,
})
export class LostFolder {
  readonly change = input.required<ChangeView>();
  private readonly source = inject(SpectyData);
  private readonly toasts = inject(Toasts);
  private readonly preferences = inject(Preferences);
  private readonly failed = reportFailure(this.toasts, this.preferences);
  protected readonly decisions = inject(Decisions);
  protected readonly t = this.preferences.t;
  protected readonly loading = signal(false);

  /** Asks the source to bring the folder back; the page reads the change again once it is. */
  protected restore(): void {
    this.loading.set(true);
    this.source
      .restoreFolder(this.change().id)
      .then(
        () =>
          this.toasts.show(
            this.t()(
              "Carpeta recuperada: el cambio vuelve a tener su carpeta.",
              "Folder restored: the change has its folder again.",
            ),
            "success",
          ),
        this.failed,
      )
      .finally(() => this.loading.set(false));
  }
}
