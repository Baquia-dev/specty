// SPDX-License-Identifier: Apache-2.0
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import {
  LucideDynamicIcon,
  LucideMessageSquarePlus,
  LucideMinus,
  LucidePencil,
  LucidePlus,
  LucideTriangleAlert,
} from "@lucide/angular";
import { Button, IconButton } from "../components/button";
import { LIST, REVEAL, ROW, SectionDivider } from "../components/document";
import type {
  Bilingual,
  ChangeView,
  CommentAnchor,
  DeltaChipView,
  DeltaEntryView,
  DeltaView,
} from "../data/records";
import { approvedNote } from "../data/revision";
import { Preferences } from "../theme/preferences";
import { AssumptionRow } from "./assumption-row";
import { SECTION_LABELS } from "./comments";
import { BeforeLine, WordDiff } from "./spec-sections";

type Change = DeltaEntryView["change"];

/** What happened to a unit: its phase color, an icon and a word (never color alone). */
const MARKS = {
  added: { icon: LucidePlus, tone: "done", es: "Añadido", en: "Added" },
  modified: { icon: LucidePencil, tone: "implementing", es: "Modificado", en: "Modified" },
  removed: { icon: LucideMinus, tone: "cancelled", es: "Eliminado", en: "Removed" },
} as const;

/** The filters, with the plural of each change for the summary. */
const FILTERS = [
  { key: "all", es: "Todo", en: "All" },
  { key: "added", es: "Añadidos", en: "Added" },
  { key: "modified", es: "Modificados", en: "Modified" },
  { key: "removed", es: "Eliminados", en: "Removed" },
] as const;

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

/** Items carry their id; texts, files and the title are named by their group or their text. */
const ITEM_KINDS: ReadonlySet<DeltaEntryView["kind"]> = new Set([
  "assumption",
  "criterion",
  "task",
  "risk",
]);

/** A task's chip: added ones on a faint tint, removed ones struck out, possible new scope in amber. */
const CHIP = "inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-xs";
const CHIP_TONE = {
  added: "border-phase-done bg-phase-done-bg/70",
  removed: "border-border text-text-muted line-through",
  scope: "border-phase-review text-phase-review",
  plain: "border-border",
} as const;

/** Added, modified or removed, with its icon and color. */
@Component({
  selector: "sp-change-mark",
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      "flex h-6 items-center gap-1 self-start rounded-full px-2.5 text-xs font-medium whitespace-nowrap",
    "[style.color]": "'var(--color-phase-' + mark().tone + ')'",
    "[style.background]": "'var(--color-phase-' + mark().tone + '-bg)'",
    "[attr.data-change]": "change()",
  },
  template: `<svg [lucideIcon]="mark().icon" size="13" aria-hidden="true"></svg>{{ t()(mark().es, mark().en) }}`,
})
export class ChangeMark {
  readonly change = input.required<Change>();
  protected readonly t = inject(Preferences).t;
  protected readonly mark = computed(() => MARKS[this.change()]);
}

/** "What changed since you approved" (docs/ui.md): the delta first, the full spec on demand. */
@Component({
  selector: "sp-review-delta",
  imports: [
    LucideDynamicIcon,
    Button,
    IconButton,
    AssumptionRow,
    ChangeMark,
    WordDiff,
    BeforeLine,
    SectionDivider,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Positioned, so the screen-reader text of the diff (absolute) stays inside the scrolling area.
  host: { class: "relative flex flex-col gap-6" },
  template: `
    <header class="flex flex-col gap-3 border-b border-border pb-5">
      <!-- Which revision is approved, when and by whom: in a team, not always who is looking. -->
      @if (approved(); as note) {
        <p class="m-0 text-xs text-text-muted" data-approved>{{ note }}</p>
      }
      <div class="flex flex-wrap items-center gap-3">
        <h2 class="m-0 text-[1.375rem] leading-tight font-semibold tracking-tight">{{ t()('Qué cambió desde la revisión ', 'What changed since revision ') }}{{ delta().approvedRevision }}</h2>
        <sp-button class="ml-auto" size="sm" (pressed)="showFull.emit()">{{ t()('Ver spec completa', 'See the full spec') }}</sp-button>
      </div>
      <p class="m-0 text-sm text-text-muted" data-summary>{{ summary() }}</p>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <!-- On a phone the filters scroll sideways inside their group instead of widening the page. -->
        <div class="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-text/5 p-1 scrollbar-none" role="group" [attr.aria-label]="t()('Filtrar cambios', 'Filter changes')" data-filters>
          @for (option of filters(); track option.key) {
            <button type="button" class="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border-0 bg-transparent px-2.5 font-sans text-[13px] whitespace-nowrap text-text-muted aria-pressed:bg-surface aria-pressed:font-semibold aria-pressed:text-text aria-pressed:shadow-sm" [attr.aria-pressed]="filter() === option.key" (click)="filter.set(option.key)">
              @if (option.tone) {
                <span class="size-1.5 rounded-full" [style.background]="'var(--color-phase-' + option.tone + ')'" aria-hidden="true"></span>
              }
              {{ option.label }}&ngsp;<span class="font-mono text-[11px] font-normal text-text-muted">{{ option.count }}</span>
            </button>
          }
        </div>
        <p class="m-0 text-xs text-text-muted" data-legend>
          {{ t()('Lo nuevo va', 'New text is') }}&ngsp;<span class="rounded-sm bg-phase-done-bg/70 text-text shadow-[inset_0_-1px_0_var(--color-phase-done)]">{{ t()('resaltado', 'highlighted') }}</span>;
          {{ t()('lo quitado aparece en «Antes».', 'removed text shows under «Before».') }}
        </p>
      </div>
    </header>

    @for (group of groups(); track group.section) {
      <section class="flex flex-col" [attr.data-delta-section]="group.section" [attr.aria-labelledby]="'delta-' + group.section">
        <sp-section-divider [heading]="labels[group.section][lang()]" [headingId]="'delta-' + group.section" [meta]="group.entries.length" />
        <div role="list" [class]="list + ' mt-3'">
          @for (entry of group.entries; track entry.key) {
            @if (assumptionOf(entry); as assumption) {
              <sp-assumption-row [change]="change().id" [assumption]="assumption" [diff]="entry.text" [before]="entry.before" [editable]="editable()" (comment)="comment.emit($event)">
                <sp-change-mark data-mark [change]="entry.change" />
                @for (detail of entry.details; track $index) {
                  <p class="m-0 text-sm text-text-muted" data-detail>{{ detail[lang()] }}</p>
                }
              </sp-assumption-row>
            } @else {
              <div role="listitem" [class]="row" [attr.data-item]="entry.key">
                <span class="pt-0.5 font-mono text-xs text-text-muted">{{ isItem(entry) ? entry.key : '' }}</span>
                <div class="flex min-w-0 flex-col gap-1.5">
                  @if (entry.change === 'removed') {
                    <p class="m-0 whitespace-pre-wrap text-text-muted line-through decoration-text-muted/60" data-removed><span class="sr-only">{{ t()('Eliminado: ', 'Removed: ') }}</span>{{ plain(entry) }}</p>
                  } @else {
                    <sp-word-diff [class.font-medium]="entry.kind === 'task'" [parts]="entry.text" />
                  }
                  @if (entry.before; as before) {
                    <sp-before-line [parts]="before" />
                  }
                  @if (entry.chips; as chips) {
                    <div class="flex flex-wrap gap-1" data-chips>
                      @for (chip of chips; track chip.label + chip.change) {
                        <span [class]="chipClass(chip)" [class.font-mono]="chip.kind === 'file'" [attr.data-chip]="chip.change ?? (chip.newScope ? 'scope' : 'same')">
                          @if (chip.newScope) {
                            <svg [lucideIcon]="warningIcon" size="12" aria-hidden="true"></svg><span class="sr-only">{{ t()('posible alcance nuevo:', 'possible new scope:') }}&ngsp;</span>
                          }
                          @if (chip.change) {
                            <span class="sr-only">{{ chip.change === 'added' ? t()('añadido:', 'added:') : t()('quitado:', 'removed:') }}&ngsp;</span>
                          }
                          {{ chip.label }}
                        </span>
                      }
                    </div>
                  }
                  @for (detail of entry.details; track $index) {
                    <p class="m-0 text-sm text-text-muted" data-detail>{{ detail[lang()] }}</p>
                  }
                  @for (note of entry.newScope; track $index) {
                    <p class="m-0 flex items-start gap-2 text-sm" style="color: var(--color-phase-review)" role="note" data-new-scope>
                      <svg class="mt-1 shrink-0" [lucideIcon]="warningIcon" size="14" aria-hidden="true"></svg>
                      <span><strong class="font-semibold">{{ t()('Posible alcance nuevo', 'Possible new scope') }}:</strong> {{ note[lang()] }}</span>
                    </p>
                  }
                </div>
                <div class="flex items-start gap-1">
                  <sp-change-mark [change]="entry.change" />
                  @if (isItem(entry) && entry.change !== 'removed') {
                    <sp-icon-button [class]="reveal" size="sm" [label]="t()('Comentar ' + entry.key, 'Comment on ' + entry.key)" [icon]="commentIcon" (pressed)="comment.emit({ item: entry.key })" />
                  } @else {
                    <!-- Same room as the comment button, so every mark lines up. -->
                    <span class="size-8 shrink-0" aria-hidden="true"></span>
                  }
                </div>
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
  /** Which changes to show. */
  /** «La 2 está aprobada · 19 oct · Ana Gómez». */
  protected readonly approved = computed(() => approvedNote(this.change(), this.lang()));
  protected readonly filter = signal<"all" | Change>("all");

  private count(change: "all" | Change): number {
    return this.delta().entries.filter((entry) => change === "all" || entry.change === change)
      .length;
  }

  protected readonly filters = computed(() =>
    FILTERS.map((option) => ({
      key: option.key,
      label: this.t()(option.es, option.en),
      count: this.count(option.key),
      tone: option.key === "all" ? undefined : MARKS[option.key].tone,
    })),
  );

  protected readonly groups = computed(() => {
    const filter = this.filter();
    const shown = this.delta().entries.filter(
      (entry) => filter === "all" || entry.change === filter,
    );
    return GROUPS.map((section) => ({
      section,
      entries: shown.filter((entry) => entry.section === section),
    })).filter((group) => group.entries.length > 0);
  });

  /** "2 añadidos · 3 modificados · 1 eliminado". */
  protected readonly summary = computed(() => {
    const t = this.t();
    const words = {
      added: [t("añadido", "added"), t("añadidos", "added")],
      modified: [t("modificado", "modified"), t("modificados", "modified")],
      removed: [t("eliminado", "removed"), t("eliminados", "removed")],
    } as const;
    return (["added", "modified", "removed"] as const)
      .map((change) => [this.count(change), words[change]] as const)
      .filter(([n]) => n > 0)
      .map(([n, [one, many]]) => `${n} ${n === 1 ? one : many}`)
      .join(" · ");
  });

  protected isItem(entry: DeltaEntryView): boolean {
    return ITEM_KINDS.has(entry.kind);
  }

  protected plain(entry: DeltaEntryView): string {
    return entry.text.map((part) => part.text).join("");
  }

  protected chipClass(chip: DeltaChipView): string {
    const tone = chip.newScope ? "scope" : (chip.change ?? "plain");
    return `${CHIP} ${CHIP_TONE[tone]}`;
  }

  /** An assumption still in the spec is decided right here, like in the full review. */
  protected assumptionOf(entry: DeltaEntryView) {
    if (entry.kind !== "assumption" || entry.change === "removed") return undefined;
    return this.change().review.assumptions.find((item) => item.id === entry.key);
  }
}
