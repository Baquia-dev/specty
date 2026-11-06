// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, input } from "@angular/core";

/**
 * The block of an epic in a section of the Inbox: the epic's own row heads it, projected with
 * `data-epic-head`, and its slices (features) go below, indented. The rows stay in the Inbox's
 * template, so its j/k find them.
 */
@Component({
  selector: "sp-inbox-epic",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      "my-1.5 flex flex-col gap-1 rounded-xl border border-border/80 bg-surface/50 px-3 py-2.5",
    "[attr.data-epic-group]": "epicId()",
  },
  template: `
    <ng-content select="[data-epic-head]" />
    <div class="flex flex-col gap-0.5 border-l-2 border-border pl-3 empty:hidden" data-epic-features>
      <ng-content />
    </div>
  `,
})
export class InboxEpic {
  readonly epicId = input.required<string>();
}
