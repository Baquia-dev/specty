// SPDX-License-Identifier: Apache-2.0
// Pieces that make a screen read like a well-formatted document (docs/ui.md, design system).
import { ChangeDetectionStrategy, Component, input } from "@angular/core";

/** The width of a page's content, and its side margin; shared by every page. */
export const PAGE = "mx-auto w-full max-w-6xl px-6";

/**
 * A document row: an id in a fixed column, the content, and its actions on the right. No lines
 * between rows: the one under the pointer, or with focus inside, lights up softly instead.
 */
export const ROW =
  "group -mx-3 grid grid-cols-[2.75rem_minmax(0,1fr)_auto] gap-x-3 rounded-lg px-3 py-3 transition-colors duration-150 hover:bg-text/4 focus-within:bg-text/4 motion-reduce:transition-none";

/** A row's actions show with the pointer over the row or focus inside it. */
export const REVEAL = "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100";

/** The rows of a section, indented under its title; the section's divider is the only line. */
export const LIST = "m-0 flex list-none flex-col gap-0.5 p-0 pl-6";

/**
 * Opens a section: its title in small capitals, a hairline, and a count or progress. The next
 * divider closes it, so lists under it need no line of their own.
 */
@Component({
  selector: "sp-section-divider",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "flex items-center gap-3 font-mono text-[11px] text-text-muted" },
  template: `
    @if (level() === 2) {
      <h2 [class]="title" [id]="headingId() || null">{{ heading() }}</h2>
    } @else {
      <h3 [class]="title" [id]="headingId() || null">{{ heading() }}</h3>
    }
    <span class="h-px flex-1 bg-border" aria-hidden="true"></span>
    @if (meta() !== '') {
      <span data-meta>{{ meta() }}</span>
    }
  `,
})
export class SectionDivider {
  readonly heading = input.required<string>();
  /** To label the section with `aria-labelledby`. */
  readonly headingId = input("");
  /** A count or a progress line, on the right. */
  readonly meta = input<string | number>("");
  readonly level = input<2 | 3>(3);
  protected readonly title = "m-0 font-sans text-xs font-medium tracking-[0.12em] uppercase";
}
