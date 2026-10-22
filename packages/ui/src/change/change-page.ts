// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, input } from "@angular/core";

/** One change, with its tabs. Filled in by a later task. */
@Component({
  selector: "sp-change-page",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1 class="m-0 px-6 py-6 font-mono text-xl">{{ id() }}</h1>`,
})
export class ChangePage {
  readonly id = input.required<string>();
}
