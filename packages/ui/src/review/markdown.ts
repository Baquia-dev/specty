// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";
import { marked } from "marked";

/**
 * Markdown written by the agent or the person. Angular sanitizes what `[innerHTML]` receives,
 * so scripts, event handlers and unsafe URLs never reach the page.
 */
@Component({
  selector: "sp-markdown",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      "block max-w-[72ch] text-base [&_a]:underline [&_code]:rounded-sm [&_code]:bg-bg [&_code]:px-1 [&_code]:font-mono [&_code]:text-sm [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border [&_pre]:bg-bg [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5",
  },
  template: `<div [innerHTML]="html()"></div>`,
})
export class Markdown {
  readonly text = input("");
  protected readonly html = computed(() => marked(this.text(), { async: false, gfm: true }));
}
