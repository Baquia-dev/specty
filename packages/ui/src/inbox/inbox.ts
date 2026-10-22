// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { Preferences } from "../theme/preferences";

/** The Inbox: what waits for the person first. Filled in by the next task. */
@Component({
  selector: "sp-inbox",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1 class="m-0 px-6 py-6 text-xl font-semibold">{{ t()('Bandeja', 'Inbox') }}</h1>`,
})
export class Inbox {
  protected readonly t = inject(Preferences).t;
}
