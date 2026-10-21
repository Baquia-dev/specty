// SPDX-License-Identifier: Apache-2.0
import {
  type ConnectedPosition,
  createFlexibleConnectedPositionStrategy,
  createOverlayRef,
  createRepositionScrollStrategy,
  type OverlayRef,
} from "@angular/cdk/overlay";
import { TemplatePortal } from "@angular/cdk/portal";
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  inject,
  input,
  type TemplateRef,
  ViewContainerRef,
  viewChild,
} from "@angular/core";

let nextId = 0;

/** Elements that can carry the description: the first one inside the tooltip's content. */
const DESCRIBED = "button, a[href], input, textarea, select, [tabindex]";
/** Time to move the pointer from the content onto the tooltip without it closing. */
const GRACE_MS = 100;

/** Above first; then below, right and left, whichever fits on screen. */
export const TOOLTIP_POSITIONS: readonly ConnectedPosition[] = [
  { originX: "center", originY: "top", overlayX: "center", overlayY: "bottom", offsetY: -8 },
  { originX: "center", originY: "bottom", overlayX: "center", overlayY: "top", offsetY: 8 },
  { originX: "end", originY: "center", overlayX: "start", overlayY: "center", offsetX: 8 },
  { originX: "start", originY: "center", overlayX: "end", overlayY: "center", offsetX: -8 },
];

/**
 * Wraps its content and explains it on hover or focus (WCAG 1.4.13: it stays while the pointer
 * is over the content or the tooltip, and Escape closes it). The text is always in the page as
 * the content's description; the visible bubble floats in a CDK overlay that never leaves the
 * screen. The host, not the content, listens to the pointer, so it also works around a disabled
 * `<button>`, which gets no pointer events.
 */
@Component({
  selector: "sp-tooltip",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: "relative inline-flex",
    "(pointerenter)": "show()",
    "(pointerleave)": "hideSoon()",
    "(focusin)": "show()",
    "(focusout)": "hide()",
    "(document:keydown.escape)": "hide()",
  },
  template: `
    <ng-content />
    @if (text()) {
      <span role="tooltip" class="sr-only" [id]="id">{{ text() }}</span>
    }
    <ng-template #bubble>
      <span
        aria-hidden="true"
        data-tooltip
        class="max-w-64 rounded-md bg-text px-2 py-1 text-xs text-bg shadow-md transition-opacity starting:opacity-0"
        style="transition-duration: var(--duration-fast)"
        (pointerenter)="stay()"
        (pointerleave)="hide()"
        >{{ text() }}</span
      >
    </ng-template>
  `,
})
export class Tooltip {
  readonly text = input("");
  /** Off when the text already is the element's name (an icon button's label). */
  readonly describe = input(true);

  protected readonly id = `sp-tooltip-${nextId++}`;
  private readonly bubble = viewChild.required<TemplateRef<unknown>>("bubble");
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly container = inject(ViewContainerRef);
  private overlay: OverlayRef | undefined;
  private leaving: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    afterRenderEffect(() => {
      const target = this.host.querySelector(DESCRIBED);
      if (target === null) return;
      if (this.text() && this.describe()) target.setAttribute("aria-describedby", this.id);
      else if (target.getAttribute("aria-describedby") === this.id) {
        target.removeAttribute("aria-describedby");
      }
    });
    inject(DestroyRef).onDestroy(() => {
      this.stay();
      this.overlay?.dispose();
    });
  }

  protected show(): void {
    this.stay();
    if (!this.text() || this.overlay?.hasAttached()) return;
    this.overlay ??= createOverlayRef(this.injector, {
      positionStrategy: createFlexibleConnectedPositionStrategy(this.injector, this.host)
        .withPositions([...TOOLTIP_POSITIONS])
        .withViewportMargin(8),
      scrollStrategy: createRepositionScrollStrategy(this.injector),
    });
    this.overlay.attach(new TemplatePortal(this.bubble(), this.container));
  }

  protected stay(): void {
    clearTimeout(this.leaving);
  }

  protected hideSoon(): void {
    this.stay();
    this.leaving = setTimeout(() => this.hide(), GRACE_MS);
  }

  protected hide(): void {
    this.stay();
    this.overlay?.detach();
  }
}
