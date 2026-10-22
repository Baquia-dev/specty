// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, computed, inject, input } from "@angular/core";
import type { ChangeView } from "../data/records";
import { approvedNote, revisionName } from "../data/revision";
import { Preferences } from "../theme/preferences";

/**
 * In one row (from lg) each fact takes the width of its content, split by hairlines, and only
 * the branch gives way, breaking over lines. Narrower, a grid of two or three columns, with no
 * lines, where the branch takes a whole row at the end. The branch is never cut.
 */
const FACTS =
  "mt-8 mb-0 grid grid-cols-2 gap-x-6 border-t border-border sm:grid-cols-3 lg:flex lg:gap-x-0";
const BASE =
  "flex min-w-0 flex-col gap-1 py-3 lg:border-l lg:border-border lg:px-6 lg:py-3.5 lg:first:border-l-0 lg:first:pl-0";
const FACT = `${BASE} lg:flex-none`;
const BRANCH = `${BASE} col-span-full max-lg:order-last lg:flex-[0_1_auto]`;
const LABEL = "text-[11px] tracking-[0.1em] whitespace-nowrap text-text-muted uppercase";

/** The facts of a change under its title: revision, branch, size and what is left to decide. */
@Component({
  selector: "sp-change-facts",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block" },
  template: `
    <dl [class]="facts">
      <div [class]="fact" data-revision>
        <dt [class]="label">{{ t()('Revisión', 'Revision') }}</dt>
        <dd class="m-0 flex flex-col gap-0.5">
          <span class="text-sm">{{ name()[lang()] }}</span>
          @if (note(); as note) {
            <span class="text-xs text-text-muted" data-approved>{{ note }}</span>
          }
        </dd>
      </div>
      @if (change().branch; as branch) {
        <div [class]="branchFact" data-branch>
          <dt [class]="label">{{ t()('Rama', 'Branch') }}</dt>
          <dd class="m-0 font-mono text-[13px] wrap-anywhere">{{ branch }}</dd>
        </div>
      }
      @if (change().size; as size) {
        <div [class]="fact">
          <dt [class]="label">{{ t()('Tamaño', 'Size') }}</dt>
          <dd class="m-0 text-sm">{{ size.level }} · {{ reasons() }}</dd>
        </div>
      }
      @if (change().phase === 'review') {
        <div [class]="fact">
          <dt [class]="label">{{ t()('Por decidir', 'To decide') }}</dt>
          <dd class="m-0 text-sm" [style.color]="change().highImpactPending ? 'var(--color-phase-review)' : 'var(--color-phase-done)'" data-to-decide>{{ toDecide() }}</dd>
        </div>
      }
    </dl>
  `,
})
export class ChangeFacts {
  readonly change = input.required<ChangeView>();

  private readonly preferences = inject(Preferences);
  protected readonly t = this.preferences.t;
  protected readonly lang = this.preferences.lang;
  protected readonly facts = FACTS;
  protected readonly fact = FACT;
  protected readonly branchFact = BRANCH;
  protected readonly label = LABEL;

  /** «Revisión 3 · por aprobar». */
  protected readonly name = computed(() => revisionName(this.change()));
  /** «La 2 está aprobada · 21 oct · Ana Gómez», when one was approved. */
  protected readonly note = computed(() => approvedNote(this.change(), this.lang()));

  protected readonly reasons = computed(() => {
    const lang = this.lang();
    return (this.change().size?.reasons ?? []).map((reason) => reason[lang]).join(" · ");
  });

  protected readonly toDecide = computed(() => {
    const t = this.t();
    const pending = this.change().highImpactPending;
    if (pending === 0) return t("Nada pendiente", "Nothing pending");
    return pending === 1
      ? t("1 supuesto de alto impacto", "1 high-impact assumption")
      : t(`${pending} supuestos de alto impacto`, `${pending} high-impact assumptions`);
  });
}
