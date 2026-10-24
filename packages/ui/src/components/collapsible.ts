// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, input, model } from "@angular/core";
import { LucideDynamicIcon } from "@lucide/angular";
import { LucideChevronDown } from "./icons";

let nextId = 0;

/**
 * A section that folds (WAI-ARIA disclosure). Folded content is `inert`: neither the keyboard
 * nor a screen reader reaches it. The height moves in `--duration-base`, 0 with reduced motion.
 */
@Component({
  selector: "sp-collapsible",
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "flex flex-col" },
  template: `
    <button
      type="button"
      class="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-left font-sans text-base font-medium text-text hover:bg-surface"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="id"
      (click)="open.set(!open())"
    >
      {{ label() }}
      <svg
        class="shrink-0 transition-transform"
        style="transition-duration: var(--duration-base)"
        size="16"
        aria-hidden="true"
        [lucideIcon]="chevron"
        [class.rotate-180]="open()"
      ></svg>
    </button>
    <div
      class="grid transition-[grid-template-rows]"
      style="transition-duration: var(--duration-base)"
      [id]="id"
      [style.grid-template-rows]="open() ? '1fr' : '0fr'"
      [attr.inert]="open() ? null : ''"
    >
      <div class="min-h-0 overflow-hidden">
        <div class="px-2 pt-2"><ng-content /></div>
      </div>
    </div>
  `,
})
export class Collapsible {
  readonly label = input.required<string>();
  readonly open = model(false);

  protected readonly id = `sp-collapsible-${nextId++}`;
  protected readonly chevron = LucideChevronDown;
}
