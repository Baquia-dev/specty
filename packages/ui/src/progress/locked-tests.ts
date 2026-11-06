// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, inject, input, signal } from "@angular/core";
import { LucideDynamicIcon } from "@lucide/angular";
import { LIST, ROW, SectionDivider } from "../components/document";
import { LucideLock, LucideLockOpen } from "../components/icons";
import { ItemText } from "../components/item-tooltip";
import type { LockedTestView } from "../data/locks";
import { Preferences } from "../theme/preferences";
import { TestCode } from "./test-code";
import { UnlockDetail } from "./unlock-detail";

type Unlock = LockedTestView["unlocks"][number];

/**
 * The approved tests a change locked (ADR 0014): the agent cannot change them unless the person
 * unlocks one for a task. Each says whether it is unlocked for the task in progress and which
 * requests unlocked it so far, and has «Ver código» and, for each unlock, «Ver el desbloqueo»: the
 * agent's reason, the approved patch and the evidence. In Progress and in Acceptance, where the
 * person reviews them.
 */
@Component({
  selector: "sp-locked-tests",
  imports: [LucideDynamicIcon, SectionDivider, ItemText, TestCode, UnlockDetail],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="locked-tests" data-locked-tests>
      <sp-section-divider [heading]="t()('Tests bloqueados', 'Locked tests')" headingId="locked-tests" [meta]="tests().length" [level]="2" />
      <ul [class]="list + ' mt-2'">
        @for (test of tests(); track test.path) {
          <li [class]="row" data-locked [attr.data-open]="test.unlockedFor ? '' : null">
            <svg class="mt-0.5" [lucideIcon]="test.unlockedFor ? openIcon : lockIcon" size="14" [style.color]="test.unlockedFor ? 'var(--color-phase-review)' : 'var(--color-text-muted)'" aria-hidden="true"></svg>
            <div class="flex min-w-0 flex-col gap-0.5">
              <code class="font-mono text-xs break-all">{{ test.path }}</code>
              <span class="text-[13px] text-text-muted" data-state><sp-item-text [text]="stateOf(test)" /></span>
              <sp-test-code class="mt-0.5" [change]="change()" [path]="test.path" />
              @for (unlock of detailed(test); track unlock.request) {
                @let key = test.path + ' ' + unlock.request;
                @let open = opened().has(key);
                <button type="button" class="h-6 w-fit cursor-pointer border-0 bg-transparent px-0 font-sans text-[13px] text-text underline" [attr.aria-expanded]="open" (click)="toggle(key)" data-unlock-toggle>
                  {{ open ? t()('Ocultar el desbloqueo ' + unlock.request, 'Hide unlock ' + unlock.request) : t()('Ver el desbloqueo ' + unlock.request, 'Show unlock ' + unlock.request) }}
                </button>
                @if (open) {
                  <div class="flex min-w-0 flex-col gap-2" [attr.data-unlock-of]="unlock.request">
                    @if (unlock.reason) {
                      <p class="m-0 text-[13px]" data-unlock-reason>{{ t()('Motivo del agente', "The agent's reason") }}: «{{ unlock.reason }}»</p>
                    }
                    @if (unlock.patch !== undefined || unlock.evidence !== undefined) {
                      <sp-unlock-detail [patch]="unlock.patch" [evidence]="unlock.evidence ?? []" />
                    }
                  </div>
                }
              }
            </div>
          </li>
        }
      </ul>
    </section>
  `,
})
export class LockedTests {
  /** The change's id: «Ver código» asks the source for its tests. */
  readonly change = input.required<string>();
  readonly tests = input.required<readonly LockedTestView[]>();

  private readonly preferences = inject(Preferences);
  protected readonly t = this.preferences.t;
  protected readonly list = LIST;
  protected readonly row = ROW;
  protected readonly lockIcon = LucideLock;
  protected readonly openIcon = LucideLockOpen;

  /** The unlocks open in «Ver el desbloqueo», by the test's path and the request. */
  protected readonly opened = signal<ReadonlySet<string>>(new Set());

  /** The unlocks of a test that have something to show: a reason, a patch or evidence. */
  protected detailed(test: LockedTestView): readonly Unlock[] {
    return test.unlocks.filter(
      (unlock) =>
        unlock.reason !== undefined || unlock.patch !== undefined || unlock.evidence !== undefined,
    );
  }

  protected toggle(key: string): void {
    const next = new Set(this.opened());
    if (!next.delete(key)) next.add(key);
    this.opened.set(next);
  }

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
