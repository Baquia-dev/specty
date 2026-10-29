// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, inject, input } from "@angular/core";
import { LucideDynamicIcon } from "@lucide/angular";
import { LIST, ROW, SectionDivider } from "../components/document";
import { LucideLock, LucideLockOpen } from "../components/icons";
import { ItemText } from "../components/item-tooltip";
import type { LockedTestView } from "../data/locks";
import { Preferences } from "../theme/preferences";

/**
 * The approved tests a change locked (ADR 0014): the agent cannot change them unless the person
 * unlocks one for a task. Each says whether it is unlocked for the task in progress and which
 * requests unlocked it so far. In Progress and in Acceptance, where the person reviews them.
 */
@Component({
  selector: "sp-locked-tests",
  imports: [LucideDynamicIcon, SectionDivider, ItemText],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="locked-tests" data-locked-tests>
      <sp-section-divider [heading]="t()('Tests bloqueados', 'Locked tests')" headingId="locked-tests" [meta]="tests().length" [level]="2" />
      <ul [class]="list + ' mt-2'">
        @for (test of tests(); track test.path) {
          <li [class]="row" data-locked [attr.data-open]="test.unlockedFor ? '' : null">
            <svg class="mt-0.5" [lucideIcon]="test.unlockedFor ? openIcon : lockIcon" size="14" [style.color]="test.unlockedFor ? 'var(--color-phase-review)' : 'var(--color-text-muted)'" aria-hidden="true"></svg>
            <p class="m-0 flex min-w-0 flex-col gap-0.5">
              <code class="font-mono text-xs break-all">{{ test.path }}</code>
              <span class="text-[13px] text-text-muted" data-state><sp-item-text [text]="stateOf(test)" /></span>
            </p>
          </li>
        }
      </ul>
    </section>
  `,
})
export class LockedTests {
  readonly tests = input.required<readonly LockedTestView[]>();

  private readonly preferences = inject(Preferences);
  protected readonly t = this.preferences.t;
  protected readonly list = LIST;
  protected readonly row = ROW;
  protected readonly lockIcon = LucideLock;
  protected readonly openIcon = LucideLockOpen;

  /** «Bloqueado · se desbloqueó con S1 para T1», or unlocked for the task in progress. */
  protected stateOf(test: LockedTestView): string {
    const t = this.t();
    const now =
      test.unlockedFor === undefined
        ? t("Bloqueado", "Locked")
        : t(
            `Desbloqueado para ${test.unlockedFor}: vuelve a bloquearse al terminarla`,
            `Unlocked for ${test.unlockedFor}: it locks again once that task is done`,
          );
    if (test.unlocks.length === 0) return now;
    const each = test.unlocks.map(({ request, task }) =>
      t(`con ${request} para ${task}`, `with ${request} for ${task}`),
    );
    return `${now} · ${t(`se desbloqueó ${each.join(" y ")}`, `unlocked ${each.join(" and ")}`)}`;
  }
}
