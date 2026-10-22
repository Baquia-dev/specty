// SPDX-License-Identifier: Apache-2.0
import { DOCUMENT } from "@angular/common";
import { DestroyRef, Injectable, inject, signal } from "@angular/core";

const MODIFIERS: ReadonlySet<string> = new Set(["Shift", "Control", "Alt", "Meta"]);

/**
 * Whether the person is using the keyboard or the pointer right now. Keyboard highlights (the
 * `j`/`k` selection) show only after a key press and hide as soon as the pointer moves or presses.
 */
@Injectable({ providedIn: "root" })
export class InputModality {
  readonly keyboard = signal(false);

  constructor() {
    const document = inject(DOCUMENT);
    const onKey = (event: KeyboardEvent) => {
      if (!MODIFIERS.has(event.key)) this.keyboard.set(true);
    };
    const onPointer = () => this.keyboard.set(false);
    const options = { capture: true, passive: true } as const;
    document.addEventListener("keydown", onKey, options);
    document.addEventListener("pointerdown", onPointer, options);
    document.addEventListener("pointermove", onPointer, options);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener("keydown", onKey, options);
      document.removeEventListener("pointerdown", onPointer, options);
      document.removeEventListener("pointermove", onPointer, options);
    });
  }
}
