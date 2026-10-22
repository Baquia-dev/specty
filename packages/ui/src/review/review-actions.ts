// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, computed, inject, input } from "@angular/core";
import { LucideDynamicIcon, LucideTriangleAlert } from "@lucide/angular";
import { Button } from "../components/button";
import { Toasts } from "../components/toast";
import { type ChangeView, SpectyData } from "../data/records";
import { Preferences } from "../theme/preferences";
import { reportFailure } from "./spec-sections";

/** The decision on the spec, fixed at the foot of the review: request changes or approve. */
@Component({
  selector: "sp-review-actions",
  imports: [LucideDynamicIcon, Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      "sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-bg/90 py-3 backdrop-blur",
    role: "region",
    "[attr.aria-label]": "t()('Decisión sobre la spec', 'Decision on the spec')",
  },
  template: `
    @if (blocked(); as reason) {
      <p class="m-0 mr-auto flex items-center gap-2 text-sm" style="color: var(--color-phase-review)" data-blocked>
        <svg [lucideIcon]="warningIcon" size="14" aria-hidden="true"></svg>{{ reason }}
      </p>
    }
    <sp-button [disabledReason]="openComments() ? '' : t()('Escribe al menos un comentario para pedir cambios.', 'Write at least one comment to request changes.')" (pressed)="requestChanges()">
      {{ t()('Pedir cambios', 'Request changes') }}
    </sp-button>
    <sp-button variant="primary" [disabledReason]="blocked()" (pressed)="approve()">
      {{ t()('Aprobar r', 'Approve r') }}{{ change().revision }}
    </sp-button>
  `,
})
export class ReviewActions {
  readonly change = input.required<ChangeView>();

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
