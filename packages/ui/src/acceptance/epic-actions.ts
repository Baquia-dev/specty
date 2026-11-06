// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, inject, input } from "@angular/core";
import { LucideDynamicIcon } from "@lucide/angular";
import { Button } from "../components/button";
import { LucideTriangleAlert } from "../components/icons";
import { Decisions } from "../data/decisions";
import type { ChangeView } from "../data/records";
import { Preferences } from "../theme/preferences";
import { ResultDialogs } from "./result-dialogs";

/** An epic is adjusted while its slices are implemented, to split one of them; no other change. */
export function adjustsWhileImplemented(change: ChangeView): boolean {
  return change.kind === "epic" && change.phase === "implementing";
}

/**
 * Asking for an adjustment of an epic while its slices are implemented, as `specty adjust`. In
 * the page header and, compact, in the sticky bar, as the decision on the result is in
 * acceptance; the epic does not wait for it, so the header says what it is for.
 */
@Component({
  selector: "sp-epic-actions",
  imports: [LucideDynamicIcon, Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: "flex flex-col items-end gap-1.5 max-lg:items-start",
    role: "group",
    "[attr.aria-label]": "t()('Ajuste de la épica', 'Adjusting the epic')",
    "[attr.data-compact]": "compact() || null",
  },
  template: `
    <sp-button [size]="compact() ? 'sm' : 'md'" [disabledReason]="decisions.blocked()" (pressed)="dialogs.adjust(change())">{{ t()('Pedir ajustes…', 'Ask for adjustments…') }}</sp-button>
    @if (!compact()) {
      @if (decisions.blocked(); as reason) {
        <p class="m-0 flex items-center gap-1.5 text-xs" style="color: var(--color-phase-review)" data-blocked>
          <svg [lucideIcon]="warningIcon" size="13" aria-hidden="true"></svg>{{ reason }}
        </p>
      } @else {
        <p class="m-0 max-w-64 text-xs text-text-muted" data-hint>{{ t()('Para dividir un corte demasiado grande o añadir uno que falta.', 'To split a slice that is too large or add one that is missing.') }}</p>
      }
    }
  `,
})
export class EpicActions {
  readonly change = input.required<ChangeView>();
  /** In the sticky bar: a small button, and no line under it. */
  readonly compact = input(false);

  protected readonly dialogs = inject(ResultDialogs);
  protected readonly decisions = inject(Decisions);
  protected readonly warningIcon = LucideTriangleAlert;
  protected readonly t = inject(Preferences).t;
}
