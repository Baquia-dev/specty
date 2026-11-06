// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, computed, inject, input } from "@angular/core";
import type { UnlockEvidence } from "@baquia-dev/specty-core";
import { DiffFileView } from "../components/diff-file";
import { patchFiles } from "../data/patch";
import { Preferences } from "../theme/preferences";
import { CodeLines } from "./code-lines";

/**
 * What an unlock of an approved test asks to do and why (ADR 0014; docs/ui.md, Progreso): its
 * patch, in the diff viewer, and each piece of evidence by its path and its lines, numbered as in
 * its file. In the pending request, before deciding, and in each locked test, once approved.
 */
@Component({
  selector: "sp-unlock-detail",
  imports: [DiffFileView, CodeLines],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "flex min-w-0 flex-col gap-3", "data-unlock-detail": "" },
  template: `
    @if (files().length > 0) {
      <div class="flex min-w-0 flex-col gap-1.5" data-unlock-patch>
        <span [class]="heading" data-unlock-heading>{{ t()('El cambio al test', 'The change to the test') }}</span>
        @for (file of files(); track $index) {
          <sp-diff-file [file]="file" />
        }
      </div>
    }
    @if (evidence().length > 0) {
      <div class="flex min-w-0 flex-col gap-1.5" data-unlock-evidence>
        <span [class]="heading" data-unlock-heading>{{ t()('El código que lo sustenta', 'The code that supports it') }}</span>
        @for (piece of evidence(); track $index) {
          <div class="flex min-w-0 flex-col gap-1" data-evidence>
            <code class="font-mono text-xs break-all text-text-muted" data-evidence-where>{{ piece.path }}:{{ piece.from }}-{{ piece.to }}</code>
            <sp-code-lines [path]="piece.path" [text]="piece.text" [start]="piece.from" />
          </div>
        }
      </div>
    }
  `,
})
export class UnlockDetail {
  /** The exact change to the tests, as a unified diff; none from an older CLI. */
  readonly patch = input<string | undefined>(undefined);
  readonly evidence = input<readonly UnlockEvidence[]>([]);

  private readonly preferences = inject(Preferences);
  protected readonly t = this.preferences.t;
  protected readonly heading = "text-[13px] font-medium text-text";

  protected readonly files = computed(() => {
    const patch = this.patch();
    return patch === undefined ? [] : patchFiles(patch);
  });
}
