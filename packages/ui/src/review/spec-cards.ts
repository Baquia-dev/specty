// SPDX-License-Identifier: Apache-2.0
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
} from "@angular/core";
import { LucideDynamicIcon } from "@lucide/angular";
import {
  LucideChevronDown,
  LucideMessageSquare,
  LucidePencilLine,
  LucideTriangleAlert,
} from "../components/icons";
import { ItemText } from "../components/item-tooltip";
import {
  type ChangeView,
  type CommentAnchor,
  type CommentView,
  type ReviewSection,
  type ReviewView,
  relativeTime,
} from "../data/records";
import { Preferences } from "../theme/preferences";
import { AssumptionRow } from "./assumption-row";
import { SECTION_LABELS } from "./comments";
import { IndependentReview } from "./independent-review";
import { Markdown } from "./markdown";
import { SECTION_META, sectionNumber, sectionProgress } from "./section-meta";
import { ReviewItems } from "./spec-sections";
import { UserRequest } from "./user-request";

/** A card in the chat: a surface of its own, apart from the others by the gap between them. */
const CARD = "flex flex-col rounded-xl border border-border bg-surface";

/** How many items a section lists, where it lists them: its summary when it has no progress. */
const COUNTS: Partial<Record<ReviewSection, (review: ReviewView) => number>> = {
  assumptions: (review) => review.assumptions.length,
  criteria: (review) => review.criteria.length,
  risks: (review) => review.risks.length,
  tasks: (review) => review.tasks.length,
  files: (review) => review.files.reduce((total, group) => total + group.files.length, 0),
};

/** What the header of a section's card says, closed or open. */
interface SectionCard {
  readonly key: ReviewSection;
  readonly number: string;
  readonly label: string;
  readonly hint: string;
  /** The section's progress or, without it, how many items it lists; "" when neither. */
  readonly summary: string;
  /** High-impact assumptions undecided and warnings: what the person should look at. */
  readonly attention: number;
  readonly comments: number;
  /** Whether the section changed since the approved revision. */
  readonly changed: boolean;
}

/** The spec's comments, as a list to read: in the chat nobody comments. */
@Component({
  selector: "sp-card-comments",
  imports: [ItemText],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "flex flex-col gap-3" },
  template: `
    <h2 class="m-0 flex items-baseline justify-between text-xs font-medium tracking-[0.12em] text-text-muted uppercase">
      {{ t()('Comentarios', 'Comments') }}&ngsp;<span class="font-mono tracking-normal">{{ comments().length }}</span>
    </h2>
    <ul class="m-0 flex list-none flex-col gap-3 p-0">
      @for (comment of comments(); track comment.id) {
        <li class="flex flex-col gap-1 text-sm" [class.opacity-60]="comment.resolved" [attr.data-comment]="comment.id">
          <span class="font-mono text-[11px] text-text-muted"><sp-item-text [text]="anchorLabel(comment.anchor)" /></span>
          <p class="m-0 leading-normal"><sp-item-text [text]="comment.body" /></p>
          <span class="text-xs text-text-muted">
            {{ comment.author }} · {{ since(comment.createdAt) }} · {{ t()('en la revisión ', 'on revision ') }}{{ comment.revision }}
          </span>
        </li>
      }
    </ul>
  `,
})
class CardComments {
  readonly comments = input.required<readonly CommentView[]>();
  private readonly preferences = inject(Preferences);
  protected readonly t = this.preferences.t;

  protected anchorLabel(anchor: CommentAnchor): string {
    const t = this.t();
    if ("item" in anchor) return t(`Sobre ${anchor.item}`, `On ${anchor.item}`);
    return `${SECTION_LABELS[anchor.section][this.preferences.lang()]}: «${anchor.quote}»`;
  }

  protected since(iso: string): string {
    return relativeTime(iso, Date.now(), this.preferences.lang());
  }
}

/**
 * The spec in the chat (docs/ui.md): one compact card per section, which opens with its header.
 * Only the Goal starts open; the person's cards stay as they are while the same change updates.
 * It only reads: no comments, no decisions.
 */
@Component({
  selector: "sp-spec-cards",
  imports: [
    LucideDynamicIcon,
    Markdown,
    AssumptionRow,
    ReviewItems,
    UserRequest,
    IndependentReview,
    CardComments,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "flex flex-col gap-2" },
  template: `
    @if (change().specReview; as independent) {
      <section data-card="review" [class]="card + ' p-4'">
        <sp-independent-review [review]="independent" />
      </section>
    }
    @for (entry of cards(); track entry.key) {
      <section [class]="card" [attr.data-card]="entry.key">
        <h2 class="m-0 text-base font-normal">
          <button type="button" class="flex w-full cursor-pointer items-center gap-3 rounded-xl border-0 bg-transparent px-4 py-2.5 text-left font-sans text-text transition-colors duration-150 hover:bg-text/3 motion-reduce:transition-none" [attr.aria-expanded]="isOpen(entry.key)" [attr.aria-controls]="'spec-card-' + entry.key" (click)="toggle(entry.key)">
            <span class="w-5 shrink-0 font-mono text-[11px] text-text-muted">{{ entry.number }}&ngsp;</span>
            <!-- One line: the hint, beside the title, is cut short where it does not fit. -->
            <span class="flex min-w-0 flex-1 items-baseline gap-2.5">
              <span class="shrink-0 text-sm leading-snug font-semibold" data-title>{{ entry.label }}&ngsp;</span>
              <span class="min-w-0 truncate text-[13px] text-text-muted" data-hint>{{ entry.hint }}</span>
            </span>
            <span class="flex shrink-0 items-center justify-end gap-x-2.5 font-mono text-[11px] text-text-muted">
              @if (entry.changed) {
                <span class="flex items-center gap-1 text-text" data-changed><svg [lucideIcon]="changedIcon" size="11" aria-hidden="true"></svg>{{ t()('Cambió', 'Changed') }}</span>
              }
              @if (entry.attention > 0) {
                <span class="flex items-center gap-0.5" style="color: var(--color-phase-review)" data-attention>
                  <svg [lucideIcon]="warningIcon" size="11" aria-hidden="true"></svg>{{ entry.attention }}<span class="sr-only">&ngsp;{{ t()('por revisar', 'to check') }}</span>
                </span>
              }
              @if (entry.comments > 0) {
                <span class="flex items-center gap-0.5" data-comments>
                  <svg [lucideIcon]="commentIcon" size="11" aria-hidden="true"></svg>{{ entry.comments }}<span class="sr-only">&ngsp;{{ t()('comentarios', 'comments') }}</span>
                </span>
              }
              @if (entry.summary) {
                <span data-summary>{{ entry.summary }}</span>
              }
            </span>
            <span class="flex shrink-0 text-text-muted transition-transform duration-150 motion-reduce:transition-none" [class.rotate-180]="isOpen(entry.key)" aria-hidden="true">
              <svg [lucideIcon]="chevronIcon" size="16"></svg>
            </span>
          </button>
        </h2>
        <div [id]="'spec-card-' + entry.key">
          @if (isOpen(entry.key)) {
            <div class="flex flex-col gap-3 pr-4 pb-3.5 pl-12 text-sm" data-card-body>
              @switch (entry.key) {
                @case ('goal') {
                  <sp-markdown class="leading-relaxed" [text]="review().goal" />
                  @if (change().request; as asked) { <sp-user-request [text]="asked" /> }
                }
                @case ('outOfScope') { <sp-markdown class="leading-relaxed" [text]="review().outOfScope" /> }
                @case ('assumptions') {
                  <div role="list" class="m-0 flex list-none flex-col gap-0.5 p-0">
                    @for (assumption of review().assumptions; track assumption.id) {
                      <sp-assumption-row [change]="change().id" [assumption]="assumption" />
                    }
                  </div>
                }
                @case ('design') { <sp-markdown [text]="review().design" /> }
                @default { <sp-review-items class="-ml-6" [review]="review()" [section]="itemSection(entry.key)" /> }
              }
            </div>
          }
        </div>
      </section>
    }
    @if (review().comments.length > 0) {
      <section data-card="comments" [class]="card + ' p-4'">
        <sp-card-comments [comments]="review().comments" />
      </section>
    }
  `,
})
export class SpecCards {
  readonly change = input.required<ChangeView>();

  private readonly preferences = inject(Preferences);
  protected readonly t = this.preferences.t;
  protected readonly card = CARD;
  protected readonly chevronIcon = LucideChevronDown;
  protected readonly warningIcon = LucideTriangleAlert;
  protected readonly commentIcon = LucideMessageSquare;
  protected readonly changedIcon = LucidePencilLine;

  protected readonly review = computed(() => this.change().review);
  /** The open cards: only the Goal for each change; another read of the same one keeps them. */
  private readonly open = linkedSignal<string, ReadonlySet<ReviewSection>>({
    source: () => this.change().id,
    computation: (id, previous) =>
      previous?.source === id ? previous.value : new Set<ReviewSection>(["goal"]),
  });

  protected readonly cards = computed((): readonly SectionCard[] => {
    const review = this.review();
    const lang = this.preferences.lang();
    const changed = new Set<string>((review.delta?.entries ?? []).map((entry) => entry.section));
    return review.index
      .filter((entry) => entry.present)
      .map((entry, position) => ({
        key: entry.key,
        number: sectionNumber(position),
        label: SECTION_LABELS[entry.key][lang],
        hint: SECTION_META[entry.key].hint[lang],
        summary: this.summary(entry.key, review),
        attention: entry.pending + entry.warnings,
        comments: entry.comments,
        changed: changed.has(entry.key),
      }));
  });

  protected isOpen(key: ReviewSection): boolean {
    return this.open().has(key);
  }

  protected toggle(key: ReviewSection): void {
    this.open.update((open) => {
      const next = new Set(open);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  protected itemSection(key: ReviewSection): "criteria" | "files" | "tasks" | "risks" {
    return key === "files" || key === "tasks" || key === "risks" ? key : "criteria";
  }

  private summary(key: ReviewSection, review: ReviewView): string {
    const progress = sectionProgress(key, review, this.t());
    if (progress !== "") return progress;
    const count = COUNTS[key];
    return count === undefined ? "" : String(count(review));
  }
}
