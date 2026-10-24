// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, inject, input } from "@angular/core";
import { LucideDynamicIcon } from "@lucide/angular";
import { LIST, ROW, SectionDivider } from "../components/document";
import { LucideTriangleAlert } from "../components/icons";
import type { WarningView } from "../data/records";
import { Preferences } from "../theme/preferences";

/**
 * What `specty task done` warned about the tasks, the AVISOS the agent sees in the terminal: risky
 * patterns in what a task added (file, line, what was found and its CWE) and assertions removed
 * from tests that already existed. To review before accepting; they are known patterns, not
 * certain flaws.
 */
@Component({
  selector: "sp-acceptance-warnings",
  imports: [LucideDynamicIcon, SectionDivider],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="acceptance-warnings" data-warnings>
      <sp-section-divider [heading]="t()('Avisos', 'Warnings')" headingId="acceptance-warnings" [meta]="warnings().length" [level]="2" />
      <p class="m-0 mt-2 text-sm text-text-muted">
        {{ t()('Lo que encontró specty task done en lo que añadieron las tareas. Son patrones conocidos, no fallos seguros: revísalos antes de aceptar.', 'What specty task done found in what the tasks added. They are known patterns, not certain flaws: review them before accepting.') }}
      </p>
      <ul [class]="list + ' mt-2'">
        @for (warning of warnings(); track $index) {
          <li [class]="row" [attr.data-kind]="warning.kind">
            <span class="pt-0.5 font-mono text-xs text-text-muted">{{ warning.task }}</span>
            <p class="m-0 flex items-start gap-2">
              <svg class="mt-0.5 shrink-0" [lucideIcon]="icon" size="14" style="color: var(--color-phase-review)" aria-hidden="true"></svg>
              <span><code class="font-mono text-xs break-all">{{ place(warning) }}</code>&ngsp;{{ warning.text[lang()] }}@if (warning.cwe) {&ngsp;<span class="text-text-muted">({{ warning.cwe }})</span>}</span>
            </p>
          </li>
        }
      </ul>
    </section>
  `,
})
export class AcceptanceWarnings {
  readonly warnings = input.required<readonly WarningView[]>();

  private readonly preferences = inject(Preferences);
  protected readonly t = this.preferences.t;
  protected readonly lang = this.preferences.lang;
  protected readonly icon = LucideTriangleAlert;
  protected readonly list = LIST;
  protected readonly row = ROW;

  /** The file, and the line when the warning has one: «src/api.ts:7». */
  protected place(warning: WarningView): string {
    return warning.line === undefined ? warning.path : `${warning.path}:${warning.line}`;
  }
}
