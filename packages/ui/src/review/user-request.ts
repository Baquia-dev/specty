// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, inject, input } from "@angular/core";
import { LucideDynamicIcon } from "@lucide/angular";
import { LucideQuote } from "../components/icons";
import { Preferences } from "../theme/preferences";

/**
 * What the person asked for, word for word (`specty new --request`), under the Goal the agent
 * wrote: quoted, as plain text and in its own tone, so the two are not mistaken for each other.
 */
@Component({
  selector: "sp-user-request",
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "mt-4 flex flex-col gap-1.5 border-l-2 border-border pl-4", "data-request": "" },
  template: `
    <p class="m-0 flex items-center gap-1.5 text-xs font-medium text-text-muted">
      <svg [lucideIcon]="icon" size="13" aria-hidden="true"></svg>{{ t()('Lo que pediste', 'What you asked for') }}
    </p>
    <blockquote class="m-0 text-base whitespace-pre-line text-text-muted">{{ t()('«' + text() + '»', '“' + text() + '”') }}</blockquote>
  `,
})
export class UserRequest {
  readonly text = input.required<string>();
  protected readonly t = inject(Preferences).t;
  protected readonly icon = LucideQuote;
}
