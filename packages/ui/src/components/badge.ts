// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, computed, inject, input } from "@angular/core";
import type { ChangeKind, Lang, Phase } from "@baquia-dev/specty-core";
import { LucideDynamicIcon } from "@lucide/angular";
import type { ChangeView } from "../data/records";
import { Preferences } from "../theme/preferences";
import { PHASE_LABELS } from "../theme/tokens";
import {
  LucideArchive,
  LucideBan,
  LucideCircleCheck,
  LucideCode,
  LucideComponent,
  LucideEye,
  LucideFilePlus,
  LucideFlaskConical,
  LucideGitCommitHorizontal,
  LucideLayers,
  LucideLightbulb,
  LucideListChecks,
  LucidePencilLine,
  LucidePlay,
  LucideWrench,
} from "./icons";

/** Phases are never told apart by color alone: each one has its icon and its name. */
const PHASE_ICONS = {
  draft: LucidePencilLine,
  review: LucideEye,
  testing: LucideFlaskConical,
  implementing: LucideCode,
  adjusting: LucideWrench,
  acceptance: LucideListChecks,
  closing: LucideArchive,
  done: LucideCircleCheck,
  cancelled: LucideBan,
} as const satisfies Record<Phase, unknown>;

const KIND_ICONS = {
  epic: LucideLayers,
  standard: LucideFilePlus,
  quick: LucidePlay,
  retro: LucideGitCommitHorizontal,
  spike: LucideLightbulb,
} as const satisfies Record<ChangeKind, unknown>;

const KIND_LABELS: Readonly<Record<ChangeKind, Readonly<Record<Lang, string>>>> = {
  epic: { es: "Épica", en: "Epic" },
  standard: { es: "Individual", en: "Standalone" },
  quick: { es: "Quick", en: "Quick" },
  retro: { es: "Manual", en: "Manual" },
  spike: { es: "Spike", en: "Spike" },
};

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

/** Identifies the kind of a change (or the epic slice it implements) with an icon and label. */
@Component({
  selector: "sp-kind-badge",
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      "inline-flex h-5 max-w-full items-center gap-1 rounded-sm border border-border bg-surface px-1.5 text-[11px] font-medium text-text-muted",
    "[attr.data-kind]": "epic() ? 'slice' : kind()",
    "[attr.data-epic]": "epic()?.id ?? null",
  },
  template: `
    <svg class="shrink-0" [lucideIcon]="icon()" size="11" aria-hidden="true"></svg>
    <span class="truncate">{{ label() }}</span>
  `,
})
export class KindBadge {
  readonly kind = input.required<ChangeKind>();
  readonly epic = input<ChangeView["epic"] | undefined>(undefined);

  private readonly preferences = inject(Preferences);
  protected readonly icon = computed(() =>
    this.epic() !== undefined ? LucideComponent : KIND_ICONS[this.kind()],
  );
  protected readonly label = computed(() => {
    const epic = this.epic();
    const lang = this.preferences.lang();
    if (epic === undefined) return KIND_LABELS[this.kind()][lang];
    const prefix = lang === "es" ? "Corte" : "Slice";
    const head = epic.slice ? `${prefix} ${epic.slice}` : prefix;
    return `${head} · ${epic.title}`;
  });
}
