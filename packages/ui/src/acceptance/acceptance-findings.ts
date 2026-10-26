// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, inject, input } from "@angular/core";
import { LucideDynamicIcon } from "@lucide/angular";
import { LIST, ROW, SectionDivider } from "../components/document";
import { LucideLightbulb } from "../components/icons";
import type { FindingView } from "../data/records";
import { Preferences } from "../theme/preferences";

/**
 * What the agent learned in the tasks (`specty task done --finding`), as its task cards showed
 * them: the closing takes them to its follow-ups, and a change that follows this one gets them.
 */
@Component({
  selector: "sp-acceptance-findings",
  imports: [LucideDynamicIcon, SectionDivider],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="acceptance-findings" data-findings>
      <sp-section-divider [heading]="t()('Hallazgos', 'Findings')" headingId="acceptance-findings" [meta]="findings().length" [level]="2" />
      <p class="m-0 mt-2 text-sm text-text-muted">
        {{ t()('Lo que el agente aprendió en las tareas. El cierre los lleva a Pendientes, y un cambio que siga a este los recibe.', 'What the agent learned in the tasks. The closing takes them to its follow-ups, and a change that follows this one gets them.') }}
      </p>
      <ul [class]="list + ' mt-2'">
        @for (finding of findings(); track $index) {
          <li [class]="row">
            <span class="pt-0.5 font-mono text-xs text-text-muted">{{ finding.task }}</span>
            <p class="m-0 flex items-start gap-2">
              <svg class="mt-0.5 shrink-0 text-text-muted" [lucideIcon]="icon" size="14" aria-hidden="true"></svg>
              <span>{{ finding.text }}</span>
            </p>
          </li>
        }
      </ul>
    </section>
  `,
})
export class AcceptanceFindings {
  readonly findings = input.required<readonly FindingView[]>();

  protected readonly t = inject(Preferences).t;
  protected readonly icon = LucideLightbulb;
  protected readonly list = LIST;
  protected readonly row = ROW;
}
