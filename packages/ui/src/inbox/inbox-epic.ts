// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";
import { RouterLink } from "@angular/router";
import { KindBadge, PhaseBadge } from "../components/badge";
import type { ChangeView } from "../data/records";

/**
 * The group of an epic in a section of the Inbox: the epic heads it and its slices (features) go
 * below, indented. When the epic is in the section, its own row is the head, projected with
 * `data-epic-head`; when it is not, a header with its phase, its title and its link, which j/k do
 * not stop at. The rows stay in the Inbox's template, so its j/k find them.
 */
@Component({
  selector: "sp-inbox-epic",
  imports: [RouterLink, PhaseBadge, KindBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      "my-1.5 flex flex-col gap-1 rounded-xl border border-border/80 bg-surface/50 px-3 py-2.5",
    "[attr.data-epic-group]": "epicId()",
  },
  template: `
    <ng-content select="[data-epic-head]" />
    @if (!headed()) {
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5" data-epic-header>
        @if (epic(); as loaded) {
          <sp-phase-badge [phase]="loaded.phase" />
        }
        <a class="font-semibold text-text no-underline hover:underline" [routerLink]="['/changes', epicId()]" [queryParams]="query()">{{ title() }}</a>
        <sp-kind-badge [kind]="'epic'" />
      </div>
    }
    <div class="flex flex-col gap-0.5 border-l-2 border-border pl-3" data-epic-features>
      <ng-content />
    </div>
  `,
})
export class InboxEpic {
  readonly epicId = input.required<string>();
  readonly title = input.required<string>();
  /** The epic as loaded, wherever it is: the phase and the tab of the header without a row. */
  readonly epic = input<ChangeView | undefined>(undefined);
  /** The epic's own row heads the group, projected: no header of its own. */
  readonly headed = input(false);

  /** The epic opens on the tab its phase needs, when it is loaded. */
  protected readonly query = computed(() => {
    const tab = this.epic()?.tab;
    return tab === undefined ? {} : { tab };
  });
}
