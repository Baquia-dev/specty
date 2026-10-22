// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from "@angular/core";
import {
  LucideDynamicIcon,
  LucideMessageSquarePlus,
  LucideMinus,
  LucidePencil,
  LucidePlus,
  LucideTriangleAlert,
} from "@lucide/angular";
import { Button, IconButton } from "../components/button";
import type {
  Bilingual,
  ChangeView,
  CommentAnchor,
  DeltaEntryView,
  DeltaView,
} from "../data/records";
import { Preferences } from "../theme/preferences";
import { AssumptionRow } from "./assumption-row";
import { SECTION_LABELS } from "./comments";
import { LIST, REVEAL, ROW, WordDiff } from "./spec-sections";

/** What happened to a unit: its phase color, an icon and a word (never color alone). */
const MARKS = {
  added: { icon: LucidePlus, tone: "done", es: "Añadido", en: "Added" },
  modified: { icon: LucidePencil, tone: "implementing", es: "Modificado", en: "Modified" },
  removed: { icon: LucideMinus, tone: "cancelled", es: "Eliminado", en: "Removed" },
} as const;

/** Groups in the order of the review document. */
const GROUPS: readonly DeltaEntryView["section"][] = [
  "title",
  "goal",
  "outOfScope",
  "assumptions",
  "criteria",
  "files",
  "tasks",
  "risks",
  "design",
];

const LABELS: Readonly<Record<DeltaEntryView["section"], Bilingual>> = {
  ...SECTION_LABELS,
  title: { es: "Título", en: "Title" },
};

/** Items carry their id; texts, files and the title are named by their group or their diff. */
const ITEM_KINDS: ReadonlySet<DeltaEntryView["kind"]> = new Set([
  "assumption",
  "criterion",
  "task",
  "risk",
]);

/** Added, modified or removed, with its icon and color. */
@Component({
  selector: "sp-change-mark",
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: "flex h-6 items-center gap-1 self-start rounded-full px-2.5 text-xs font-medium",
    "[style.color]": "'var(--color-phase-' + mark().tone + ')'",
    "[style.background]": "'var(--color-phase-' + mark().tone + '-bg)'",
    "[attr.data-change]": "change()",
  },
  template: `<svg [lucideIcon]="mark().icon" size="13" aria-hidden="true"></svg>{{ t()(mark().es, mark().en) }}`,
})
export class ChangeMark {
  readonly change = input.required<DeltaEntryView["change"]>();
  protected readonly t = inject(Preferences).t;
  protected readonly mark = computed(() => MARKS[this.change()]);
}

/** "What changed since you approved" (docs/ui.md): the delta first, the full spec on demand. */
@Component({
  selector: "sp-review-delta",
  imports: [LucideDynamicIcon, Button, IconButton, AssumptionRow, ChangeMark, WordDiff],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Positioned, so the screen-reader text of the diff (absolute) stays inside the scrolling area.
  host: { class: "relative flex flex-col gap-6" },
  template: `
    <header class="flex flex-col gap-1.5 border-b border-border pb-5">
      <p class="m-0 font-mono text-[11px] text-text-muted">r{{ change().revision }} · {{ t()('frente a', 'against') }} r{{ delta().approvedRevision }}</p>
      <div class="flex flex-wrap items-center gap-3">
        <h2 class="m-0 text-[1.375rem] leading-tight font-semibold tracking-tight">{{ t()('Qué cambió desde que aprobaste r', 'What changed since you approved r') }}{{ delta().approvedRevision }}</h2>
        <sp-button class="ml-auto" size="sm" (pressed)="showFull.emit()">{{ t()('Ver spec completa', 'See the full spec') }}</sp-button>
      </div>
      <p class="m-0 text-sm text-text-muted" data-summary>{{ summary() }}</p>
    </header>

    @for (group of groups(); track group.section) {
      <section class="flex flex-col" [attr.data-delta-section]="group.section" [attr.aria-labelledby]="'delta-' + group.section">
        <div class="flex items-center gap-3 font-mono text-[11px] text-text-muted">
          <h3 class="m-0 font-sans text-xs font-medium tracking-[0.12em] uppercase" [id]="'delta-' + group.section">{{ labels[group.section][lang()] }}</h3>
          <span class="h-px flex-1 bg-border" aria-hidden="true"></span>
          <span>{{ group.entries.length }}</span>
        </div>
        <div role="list" [class]="list + ' mt-3'">
          @for (entry of group.entries; track entry.key) {
            @if (assumptionOf(entry); as assumption) {
              <sp-assumption-row [change]="change().id" [assumption]="assumption" [diff]="entry.text" [editable]="editable()" (comment)="comment.emit($event)">
                <sp-change-mark [change]="entry.change" />
              </sp-assumption-row>
            } @else {
              <div role="listitem" [class]="row" [attr.data-item]="entry.key">
                <span class="pt-0.5 font-mono text-xs text-text-muted">{{ isItem(entry) ? entry.key : '' }}</span>
                <div class="flex min-w-0 flex-col gap-1.5">
                  <sp-change-mark [change]="entry.change" />
                  <sp-word-diff [parts]="entry.text" />
                  @for (note of entry.newScope; track $index) {
                    <p class="m-0 flex items-start gap-2 text-sm" style="color: var(--color-phase-review)" role="note" data-new-scope>
                      <svg class="mt-1 shrink-0" [lucideIcon]="warningIcon" size="14" aria-hidden="true"></svg>
                      <span><strong class="font-semibold">{{ t()('Posible alcance nuevo', 'Possible new scope') }}:</strong> {{ note[lang()] }}</span>
                    </p>
                  }
                </div>
                @if (isItem(entry) && entry.change !== 'removed') {
                  <sp-icon-button [class]="reveal" size="sm" [label]="t()('Comentar ' + entry.key, 'Comment on ' + entry.key)" [icon]="commentIcon" (pressed)="comment.emit({ item: entry.key })" />
                }
              </div>
            }
          }
        </div>
      </section>
    }
  `,
})
export class ReviewDelta {
  readonly change = input.required<ChangeView>();
  readonly delta = input.required<DeltaView>();
  readonly editable = input(false);
  readonly comment = output<CommentAnchor>();
  readonly showFull = output();

  private readonly preferences = inject(Preferences);
  protected readonly t = this.preferences.t;
  protected readonly lang = this.preferences.lang;
  protected readonly labels = LABELS;
  protected readonly row = ROW;
  protected readonly list = LIST;
  protected readonly reveal = REVEAL;
  protected readonly warningIcon = LucideTriangleAlert;
  protected readonly commentIcon = LucideMessageSquarePlus;

  protected readonly groups = computed(() =>
    GROUPS.map((section) => ({
      section,
      entries: this.delta().entries.filter((entry) => entry.section === section),
    })).filter((group) => group.entries.length > 0),
  );

  /** "2 añadidos · 3 modificados · 1 eliminado". */
  protected readonly summary = computed(() => {
    const t = this.t();
    const count = (change: DeltaEntryView["change"]) =>
      this.delta().entries.filter((entry) => entry.change === change).length;
    const words = {
      added: [t("añadido", "added"), t("añadidos", "added")],
      modified: [t("modificado", "modified"), t("modificados", "modified")],
      removed: [t("eliminado", "removed"), t("eliminados", "removed")],
    } as const;
    return (["added", "modified", "removed"] as const)
      .map((change) => [count(change), words[change]] as const)
      .filter(([n]) => n > 0)
      .map(([n, [one, many]]) => `${n} ${n === 1 ? one : many}`)
      .join(" · ");
  });

  protected isItem(entry: DeltaEntryView): boolean {
    return ITEM_KINDS.has(entry.kind);
  }

  /** An assumption still in the spec is decided right here, like in the full review. */
  protected assumptionOf(entry: DeltaEntryView) {
    if (entry.kind !== "assumption" || entry.change === "removed") return undefined;
    return this.change().review.assumptions.find((item) => item.id === entry.key);
  }
}
