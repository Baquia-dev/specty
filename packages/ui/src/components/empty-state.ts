// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { LucideDynamicIcon, type LucideIconInput } from "@lucide/angular";

/**
 * Nothing to show: an icon, a title, what happened and the way on (projected: text, links or
 * buttons). Announced as a status, so a screen reader hears it when it appears.
 */
@Component({
  selector: "sp-empty-state",
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "flex flex-col items-center gap-2 px-6 py-16 text-center", role: "status" },
  template: `
    @if (icon(); as glyph) {
      <svg class="mb-1 text-text-muted" [lucideIcon]="glyph" size="28" aria-hidden="true"></svg>
    }
    @if (level() === 1) {
      <h1 [class]="title">{{ heading() }}</h1>
    } @else {
      <h2 [class]="title">{{ heading() }}</h2>
    }
    <div class="flex max-w-[52ch] flex-col items-center gap-3 text-sm text-text-muted">
      <ng-content />
    </div>
  `,
})
export class EmptyState {
  readonly heading = input.required<string>();
  readonly icon = input<LucideIconInput | undefined>(undefined);
  /** 1 when the empty state is the whole page. */
  readonly level = input<1 | 2>(2);
  protected readonly title = "m-0 text-lg font-semibold text-text";
}
