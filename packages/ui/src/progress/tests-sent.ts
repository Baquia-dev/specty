// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, inject, input } from "@angular/core";
import { LucideDynamicIcon } from "@lucide/angular";
import { LIST, ROW, SectionDivider } from "../components/document";
import { LucideCircleX, LucideFlaskConical } from "../components/icons";
import { relativeTime } from "../data/records";
import type { RedCommand, TestsView } from "../data/tests";
import { Preferences } from "../theme/preferences";

/**
 * The tests of a change in `testing` (ADR 0014): while the agent writes them, a line that says
 * so; once sent, each new test by its path, each verification command that fails with its exit,
 * and what approving them means. Approving is in the header, as every decision.
 */
@Component({
  selector: "sp-tests-sent",
  imports: [LucideDynamicIcon, SectionDivider],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="progress-tests" data-tests>
      @if (tests().submittedAt; as at) {
        <sp-section-divider [heading]="t()('Tests por aprobar', 'Tests to approve')" headingId="progress-tests" [meta]="tests().files.length" [level]="2" />
        <p class="m-0 mt-2 text-sm text-text-muted" data-sent>{{ sentLine(at) }}</p>
        <ul [class]="list + ' mt-2'">
          @for (path of tests().files; track path) {
            <li [class]="row" data-test>
              <svg class="mt-0.5 text-text-muted" [lucideIcon]="testIcon" size="14" aria-hidden="true"></svg>
              <code class="font-mono text-xs break-all">{{ path }}</code>
            </li>
          }
        </ul>
        <div class="mt-2 flex flex-col gap-1.5 pl-6">
          @for (red of tests().red; track red.cmd) {
            <p class="m-0 flex items-start gap-2 text-sm" data-red>
              <svg class="mt-0.5 shrink-0" [lucideIcon]="failIcon" size="14" style="color: var(--color-phase-cancelled)" aria-hidden="true"></svg>
              <span><code class="font-mono text-xs break-all">{{ red.cmd }}</code>&ngsp;{{ exitLine(red) }}</span>
            </p>
          }
          <p class="m-0 mt-1 text-[13px] text-text-muted" data-meaning>
            {{ t()('Al aprobarlos quedan bloqueados: el agente ya no puede cambiarlos ni borrarlos sin que lo decidas, y escribe el código que los pone en verde.', 'Once approved they are locked: the agent can no longer change or delete them unless you decide so, and writes the code that turns them green.') }}
          </p>
        </div>
      } @else {
        <sp-section-divider heading="Tests" headingId="progress-tests" [level]="2" />
        <p class="m-0 mt-2 text-sm text-text-muted" data-writing>
          {{ t()('El agente escribe los tests de los criterios, antes del código. Cuando los envíe, aquí verás cada test nuevo y la verificación que falla.', 'The agent writes the tests of the criteria, before the code. Once it sends them, you will see each new test here and the verification that fails.') }}
        </p>
      }
    </section>
  `,
})
export class TestsSent {
  readonly tests = input.required<TestsView>();
  /** The clock of the page, so «hace 3 min» moves on. */
  readonly now = input(Date.now());

  private readonly preferences = inject(Preferences);
  protected readonly t = this.preferences.t;
  protected readonly list = LIST;
  protected readonly row = ROW;
  protected readonly testIcon = LucideFlaskConical;
  protected readonly failIcon = LucideCircleX;

  /** «El agente los envió hace 5 min. Fallan, como deben antes del código.» */
  protected sentLine(at: string): string {
    const when = relativeTime(at, this.now(), this.preferences.lang());
    return this.t()(
      `El agente los envió ${when}. Fallan, como deben antes del código.`,
      `The agent sent them ${when}. They fail, as they must before the code.`,
    );
  }

  /** «falla · salida 1», or «no terminó» when the command did not end by itself. */
  protected exitLine(red: RedCommand): string {
    return red.exit === null
      ? this.t()("no terminó", "did not finish")
      : this.t()(`falla · salida ${red.exit}`, `fails · exit ${red.exit}`);
  }
}
