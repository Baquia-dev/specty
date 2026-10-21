// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, computed, inject, input } from "@angular/core";
import type { Phase } from "@baquia-dev/specty-core";
import {
  LucideArchive,
  LucideBan,
  LucideCircleCheck,
  LucideCode,
  LucideDynamicIcon,
  LucideEye,
  LucideListChecks,
  LucidePencilLine,
  LucideWrench,
} from "@lucide/angular";
import { Preferences } from "../theme/preferences";
import { PHASE_LABELS } from "../theme/tokens";

/** Phases are never told apart by color alone: each one has its icon and its name. */
export const PHASE_ICONS = {
  draft: LucidePencilLine,
  review: LucideEye,
  implementing: LucideCode,
  adjusting: LucideWrench,
  acceptance: LucideListChecks,
  closing: LucideArchive,
  done: LucideCircleCheck,
  cancelled: LucideBan,
} as const satisfies Record<Phase, unknown>;

/** A neutral badge for sizes, counts and revisions. */
@Component({
  selector: "sp-badge",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      "inline-flex h-5 items-center gap-1 rounded-sm border border-border px-1.5 text-xs font-medium text-text",
  },
  template: `<ng-content />`,
})
export class Badge {}

/** The phase of a change: icon, name in the current language and the phase's colors. */
@Component({
  selector: "sp-phase-badge",
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: "inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-xs font-medium",
    "[style.color]": "'var(--color-phase-' + phase() + ')'",
    "[style.background]": "'var(--color-phase-' + phase() + '-bg)'",
    "[attr.data-phase]": "phase()",
  },
  template: `
    <svg [lucideIcon]="icon()" size="13" aria-hidden="true"></svg>
    {{ label() }}
  `,
})
export class PhaseBadge {
  readonly phase = input.required<Phase>();

  private readonly lang = inject(Preferences).lang;
  protected readonly icon = computed(() => PHASE_ICONS[this.phase()]);
  protected readonly label = computed(() => PHASE_LABELS[this.phase()][this.lang()]);
}
