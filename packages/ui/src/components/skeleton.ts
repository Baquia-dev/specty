// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, computed, inject, input } from "@angular/core";
import { Preferences } from "../theme/preferences";

/**
 * Placeholder with the final size of what is loading, instead of a spinner. The shapes are
 * hidden from assistive technology; one status line says "Loading…" once.
 */
@Component({
  selector: "sp-skeleton",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "flex flex-col gap-2", "[style.width]": "width()" },
  template: `
    @for (line of rows(); track $index) {
      <span
        aria-hidden="true"
        class="block animate-pulse rounded-md bg-border motion-reduce:animate-none"
        [style.height]="height()"
        [style.width]="line"
      ></span>
    }
    @if (announce()) {
      <span role="status" class="sr-only">{{ t()('Cargando…', 'Loading…') }}</span>
    }
  `,
})
export class Skeleton {
  readonly width = input("100%");
  readonly height = input("1rem");
  readonly lines = input(1);
  /** Off for every skeleton but one when several load together. */
  readonly announce = input(true);

  protected readonly t = inject(Preferences).t;
  /** Text-like blocks: the last of several lines is shorter. */
  protected readonly rows = computed(() => {
    const count = Math.max(1, this.lines());
    return Array.from({ length: count }, (_, index) =>
      count > 1 && index === count - 1 ? "60%" : "100%",
    );
  });
}
