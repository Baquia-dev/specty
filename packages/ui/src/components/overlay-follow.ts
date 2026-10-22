// SPDX-License-Identifier: Apache-2.0
import type { CdkConnectedOverlay } from "@angular/cdk/overlay";
import { DOCUMENT } from "@angular/common";
import { afterRenderEffect, inject } from "@angular/core";

/**
 * Keeps an always-attached connected overlay next to its origin while `open()`. It is placed
 * again when it opens, when its panel changes size (its content often renders after opening)
 * and on any scroll, listened in capture so the shell's `main` counts too: it opens above when
 * it does not fit below. Without this, the overlay keeps the place it had when the page loaded.
 * Call it in an injection context, such as a constructor.
 */
export function followOrigin(
  open: () => boolean,
  overlay: () => CdkConnectedOverlay | undefined,
): void {
  const document = inject(DOCUMENT);
  afterRenderEffect((onCleanup) => {
    const ref = overlay()?.overlayRef;
    if (!open() || ref === undefined) return;
    const follow = () => ref.updatePosition();
    follow();
    const resize = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(follow);
    resize?.observe(ref.overlayElement);
    document.addEventListener("scroll", follow, { capture: true, passive: true });
    onCleanup(() => {
      resize?.disconnect();
      document.removeEventListener("scroll", follow, { capture: true });
    });
  });
}
