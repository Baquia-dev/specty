// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, computed, inject, input } from "@angular/core";
import { DIRECTION_MARK, directionPieces } from "../highlight/highlight";
import { Preferences } from "../theme/preferences";

/**
 * A text that comes from the agent or from disk, such as a title, a path or a reason, in place of
 * interpolating it: each character of text direction shows as its code, in the attention tone and
 * with its title, as in the code (`spansOf`), so that the browser cannot reorder what the person
 * reads. It adds no class nor space: the text wraps and truncates as its parent says.
 */
@Component({
  selector: "sp-text",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@for (piece of pieces(); track $index) {@if (piece.direction) {<span [class]="mark.look" [attr.title]="mark.note[lang()]" data-direction>{{ piece.text }}</span>} @else {{{ piece.text }}}}`,
})
export class ShownText {
  readonly text = input.required<string>();
  protected readonly lang = inject(Preferences).lang;
  protected readonly mark = DIRECTION_MARK;
  protected readonly pieces = computed(() => directionPieces(this.text()));
}
