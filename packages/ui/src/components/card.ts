// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, input } from "@angular/core";

/** A surface for one item. When selected (for example with `j`/`k`), focus covers its border. */
@Component({
  selector: "sp-card",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: "flex flex-col gap-3 rounded-xl border border-border bg-surface p-4",
    "[class.outline-2]": "selected()",
    "[class.-outline-offset-2]": "selected()",
    "[class.outline-focus]": "selected()",
    "[attr.aria-current]": "selected() || null",
  },
  template: `<ng-content />`,
})
export class Card {
  readonly selected = input(false);
}
