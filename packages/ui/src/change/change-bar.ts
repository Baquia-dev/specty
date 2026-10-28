// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, computed, inject, input } from "@angular/core";
import { AcceptanceActions } from "../acceptance/acceptance-actions";
import { ClosingActions } from "../acceptance/closing-actions";
import { PhaseBadge } from "../components/badge";
import type { ChangeView, ReviewSection } from "../data/records";
import { revisionName, revisionState } from "../data/revision";
import { TestsActions } from "../progress/tests-actions";
import { SECTION_LABELS } from "../review/comments";
import { ReviewActions } from "../review/review-actions";
import { sectionNumber } from "../review/section-meta";
import { Preferences } from "../theme/preferences";

/** The compact bar slides in once the wide header is out of view; hidden, it is inert. */
const BAR =
  "absolute inset-x-0 top-0 border-b border-border bg-bg/90 backdrop-blur transition-[translate,opacity] duration-200 ease-out motion-reduce:transition-none";
const BAR_SHOWN = `${BAR} translate-y-0 opacity-100`;
const BAR_HIDDEN = `${BAR} pointer-events-none -translate-y-full opacity-0`;

/**
 * The change at a glance while scrolling: phase, title, revision, the section being read, what
 * is still to decide and the decision waiting: on the spec in review, on the tests the agent
 * sent, on the result in acceptance.
 */
@Component({
  selector: "sp-change-bar",
  imports: [PhaseBadge, ReviewActions, TestsActions, AcceptanceActions, ClosingActions],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    "[class]": "shown() ? barShown : barHidden",
    "[attr.inert]": "shown() ? null : ''",
    "data-sticky": "",
  },
  template: `
    <!--
      One line from md, with only the decision on the right: the section being read shows from
      xl, so the title has room; on a phone the actions wrap below.
    -->
    <div class="mx-auto flex min-h-14 max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-6 py-2 md:flex-nowrap">
      <sp-phase-badge [phase]="change().phase" />
      <!--
        Title, revision and section grow together into the free room and only the title gives way,
        so a long title is cut instead of pushing the actions to a second line.
      -->
      <div class="flex min-w-0 flex-1 items-center gap-3" data-heading>
        <p class="m-0 min-w-0 truncate text-[15px] font-semibold tracking-tight">{{ change().title }}</p>
        <!-- «Revisión 3 · por aprobar»; on a phone, only the number, so the title keeps its room. -->
        <span class="shrink-0 text-xs whitespace-nowrap text-text-muted" data-revision>{{ revision().number }}@if (revision().state; as state) {<span class="hidden sm:inline"> · {{ state }}</span>}</span>
        @if (readingLabel(); as section) {
          <span class="hidden h-4 w-px shrink-0 bg-border xl:block" aria-hidden="true"></span>
          <span class="hidden shrink-0 font-mono text-xs whitespace-nowrap text-text-muted xl:inline" data-reading>§ {{ section }}</span>
        }
      </div>
      @if (change().phase === 'review') {
        <sp-review-actions class="ml-auto shrink-0" [change]="change()" [compact]="true" />
      } @else if (change().decision === 'tests') {
        <sp-tests-actions class="ml-auto shrink-0" [change]="change()" [compact]="true" />
      } @else if (change().phase === 'acceptance') {
        <sp-acceptance-actions class="ml-auto shrink-0" [change]="change()" [compact]="true" />
      } @else if (change().decision === 'closing') {
        <sp-closing-actions class="ml-auto shrink-0" [change]="change()" [compact]="true" />
      }
    </div>
  `,
})
export class ChangeBar {
  readonly change = input.required<ChangeView>();
  /** The wide header is out of view. */
  readonly shown = input(false);
  /** The spec section being read, when the Spec tab is open. */
  readonly reading = input<ReviewSection | undefined>(undefined);

  private readonly preferences = inject(Preferences);
  protected readonly t = this.preferences.t;
  protected readonly barShown = BAR_SHOWN;
  protected readonly barHidden = BAR_HIDDEN;

  /** «Revisión 3» and «por aprobar»; a draft never proposed is «Sin proponer», with no state. */
  protected readonly revision = computed(() => {
    const change = this.change();
    const lang = this.preferences.lang();
    if (change.revision === 0) return { number: revisionName(change)[lang], state: "" };
    return {
      number: `${this.t()("Revisión", "Revision")} ${change.revision}`,
      state: revisionState(change)[lang],
    };
  });

  /** "04 Criterios": the section being read, numbered as in the document. */
  protected readonly readingLabel = computed(() => {
    const key = this.reading();
    const present = this.change().review.index.filter((entry) => entry.present);
    const position = present.findIndex((entry) => entry.key === key);
    if (key === undefined || position < 0) return "";
    return `${sectionNumber(position)} ${SECTION_LABELS[key][this.preferences.lang()]}`;
  });
}
