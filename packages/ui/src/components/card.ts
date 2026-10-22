// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, computed, inject, input } from "@angular/core";
import { InputModality } from "../keyboard/modality";

/**
 * A surface for one item. When selected (for example with `j`/`k`), it says so with
 * `aria-current`; the highlight over its border shows only while the keyboard is in use.
 */
@Component({
  selector: "sp-card",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: "flex flex-col gap-3 rounded-xl border border-border bg-surface p-4",
    "[class.outline-2]": "highlighted()",
    "[class.-outline-offset-2]": "highlighted()",
    "[class.outline-focus]": "highlighted()",
    "[attr.aria-current]": "selected() || null",
  },
  template: `<ng-content />`,
})
export class Card {
  readonly selected = input(false);

  private readonly modality = inject(InputModality);
  protected readonly highlighted = computed(() => this.selected() && this.modality.keyboard());
}
