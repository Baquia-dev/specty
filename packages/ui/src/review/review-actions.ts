// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, computed, inject, input } from "@angular/core";
import { LucideDynamicIcon, LucideTriangleAlert } from "@lucide/angular";
import { Button } from "../components/button";
import { Toasts } from "../components/toast";
import { type ChangeView, SpectyData } from "../data/records";
import { Preferences } from "../theme/preferences";
import { reportFailure } from "./spec-sections";

/**
 * The decision on the spec: request changes or approve. In the page header, with the reason a
 * blocked approval waits for written below; compact in the sticky bar, with it in the tooltip.
 */
@Component({
  selector: "sp-review-actions",
  imports: [LucideDynamicIcon, Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: "flex flex-col items-end gap-1.5",
    role: "group",
    "[attr.aria-label]": "t()('Decisión sobre la spec', 'Decision on the spec')",
    "[attr.data-compact]": "compact() || null",
  },
  template: `
    <div class="flex gap-2">
      <sp-button [size]="compact() ? 'sm' : 'md'" [disabledReason]="openComments() ? '' : t()('Escribe al menos un comentario para pedir cambios.', 'Write at least one comment to request changes.')" (pressed)="requestChanges()">
        {{ t()('Pedir cambios', 'Request changes') }}
      </sp-button>
      <sp-button variant="primary" [size]="compact() ? 'sm' : 'md'" [disabledReason]="blocked()" (pressed)="approve()">
        {{ t()('Aprobar r', 'Approve r') }}{{ change().revision }}
      </sp-button>
    </div>
    @if (!compact() && blocked(); as reason) {
      <p class="m-0 flex items-center gap-1.5 text-xs" style="color: var(--color-phase-review)" data-blocked>
        <svg [lucideIcon]="warningIcon" size="13" aria-hidden="true"></svg>{{ reason }}
      </p>
    }
  `,
})
export class ReviewActions {
  readonly change = input.required<ChangeView>();
  /** In the sticky bar: small buttons, and the blocking reason only in the tooltip. */
  readonly compact = input(false);

  private readonly source = inject(SpectyData);
  private readonly toasts = inject(Toasts);
  private readonly preferences = inject(Preferences);
  private readonly failed = reportFailure(this.toasts, this.preferences);
  protected readonly t = this.preferences.t;
  protected readonly warningIcon = LucideTriangleAlert;

  protected readonly openComments = computed(
    () => this.change().review.comments.filter((comment) => !comment.resolved).length,
  );
  /** Why approving must wait, if it must: shown in the tooltip and as visible text. */
  protected readonly blocked = computed(() => {
    const t = this.t();
    const pending = this.change().highImpactPending;
    const errors = this.change().review.errors.length;
    if (pending > 0) {
      return pending === 1
        ? t(
            "Falta 1 supuesto de alto impacto por decidir.",
            "1 high-impact assumption is still undecided.",
          )
        : t(
            `Faltan ${pending} supuestos de alto impacto por decidir.`,
            `${pending} high-impact assumptions are still undecided.`,
          );
    }
    if (errors > 0)
      return t(
        `La spec tiene ${errors} errores de validación.`,
        `The spec has ${errors} validation errors.`,
      );
    return "";
  });

  protected requestChanges(): void {
    this.source.requestChanges(this.change().id).then(() => {
      this.toasts.show(
        this.t()(
          "Comentarios enviados: el agente los leerá en specty next.",
          "Comments sent: the agent will read them in specty next.",
        ),
        "success",
      );
    }, this.failed);
  }

  protected approve(): void {
    const { id, revision } = this.change();
    this.source.approve(id, revision).then(() => {
      this.toasts.show(
        this.t()(`Revisión ${revision} aprobada.`, `Revision ${revision} approved.`),
        "success",
      );
    }, this.failed);
  }
}
