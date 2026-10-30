// SPDX-License-Identifier: Apache-2.0
// Pieces that make a screen read like a well-formatted document (docs/ui.md, design system).
import { ChangeDetectionStrategy, Component, input } from "@angular/core";

/** The width of a page's content, and its side margin; shared by every page. */
export const PAGE = "mx-auto w-full max-w-6xl px-6";

/**
 * A document row: an id in a fixed column, the content, and its marks or actions on the right.
 * No lines between rows: the one under the pointer, or with focus inside, lights up softly
 * instead. On a phone the id and the marks share the first line and the content (always the
 * second child) takes the full width below, instead of a narrow column between them.
 */
export const ROW =
  "group -mx-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 rounded-lg px-3 py-3 transition-colors duration-150 hover:bg-text/4 focus-within:bg-text/4 motion-reduce:transition-none max-sm:items-center max-sm:[&>:nth-child(2)]:col-span-2 max-sm:[&>:nth-child(2)]:row-start-2 sm:grid-cols-[2.75rem_minmax(0,1fr)_auto]";

/**
 * A row's actions show with the pointer over the row or focus inside it; on a touch screen,
 * with no pointer to reveal them, always.
 */
export const REVEAL =
  "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100";

/** The rows of a section, indented under its title; the section's divider is the only line. */
export const LIST = "m-0 flex list-none flex-col gap-0.5 p-0 pl-6";

/**
 * Opens a section: its title in small capitals, a hairline, and a count or progress. The next
 * divider closes it, so lists under it need no line of their own. In the chat it stays in place
 * and paints no ground, so it does not cross the translucent panel as a band.
 */
@Component({
  selector: "sp-section-divider",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      "sticky top-[var(--sp-sticky-top,0px)] z-5 -my-2 flex items-center gap-3 bg-bg py-2 font-mono text-[11px] text-text-muted embedded:static embedded:bg-transparent",
  },
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
