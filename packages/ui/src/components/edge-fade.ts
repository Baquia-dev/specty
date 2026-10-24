// SPDX-License-Identifier: Apache-2.0
import { afterNextRender, DestroyRef, Directive, ElementRef, inject } from "@angular/core";

/**
 * A row that scrolls sideways fades at the edge where more of it hides, so the person sees there
 * is more: `data-fade-start` and `data-fade-end` say which edges, and styles.css fades them. They
 * follow the scroll, the row's size and its content.
 */
@Directive({ selector: "[spEdgeFade]" })
export class EdgeFade {
  constructor() {
    const host: HTMLElement = inject(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);
    const mark = () => {
      const hidden = host.scrollWidth - host.clientWidth;
      host.toggleAttribute("data-fade-start", host.scrollLeft > 1);
      host.toggleAttribute("data-fade-end", hidden - host.scrollLeft > 1);
    };
    afterNextRender(() => {
      mark();
      host.addEventListener("scroll", mark, { passive: true });
      const resize = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(mark);
      resize?.observe(host);
      const content =
        typeof MutationObserver === "undefined" ? undefined : new MutationObserver(mark);
      content?.observe(host, { childList: true, subtree: true, characterData: true });
      destroyRef.onDestroy(() => {
        host.removeEventListener("scroll", mark);
        resize?.disconnect();
        content?.disconnect();
      });
    });
  }
}
