// SPDX-License-Identifier: Apache-2.0
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  signal,
} from "@angular/core";

let nextId = 0;

/** Elements that can carry the description: the first one inside the tooltip's content. */
const DESCRIBED = "button, a[href], input, textarea, select, [tabindex]";
const ROOM_ABOVE = 40;

/**
 * Wraps its content and explains it on hover or focus (WCAG 1.4.13: it stays while the pointer
 * is over the content or the tooltip, and Escape closes it). The host, not the content, listens
 * to the pointer, so it also works around a disabled `<button>`, which gets no pointer events.
 */
@Component({
  selector: "sp-tooltip",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: "relative inline-flex",
    "(pointerenter)": "show()",
    "(pointerleave)": "hide()",
    "(focusin)": "show()",
    "(focusout)": "hide()",
    "(document:keydown.escape)": "hide()",
  },
  template: `
    <ng-content />
    @if (text()) {
      <span
        role="tooltip"
        class="pointer-events-auto absolute left-1/2 z-10 w-max max-w-64 -translate-x-1/2 rounded-md bg-text px-2 py-1 text-xs text-bg shadow-md transition-opacity"
        style="transition-duration: var(--duration-fast)"
        [class.bottom-full]="!below()"
        [class.mb-2]="!below()"
        [class.top-full]="below()"
        [class.mt-2]="below()"
        [class.opacity-0]="!open()"
        [class.invisible]="!open()"
        [id]="id"
      >
        {{ text() }}
      </span>
    }
  `,
})
export class Tooltip {
  readonly text = input("");
  /** Off when the text already is the element's name (an icon button's label). */
  readonly describe = input(true);

  protected readonly id = `sp-tooltip-${nextId++}`;
  protected readonly open = signal(false);
  protected readonly below = signal(false);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;

  constructor() {
    afterRenderEffect(() => {
      const target = this.host.querySelector(DESCRIBED);
      if (target === null) return;
      if (this.text() && this.describe()) target.setAttribute("aria-describedby", this.id);
      else if (target.getAttribute("aria-describedby") === this.id) {
        target.removeAttribute("aria-describedby");
      }
    });
  }

  protected show(): void {
    if (!this.text()) return;
    this.below.set(this.host.getBoundingClientRect().top < ROOM_ABOVE);
    this.open.set(true);
  }

  protected hide(): void {
    this.open.set(false);
  }
}
