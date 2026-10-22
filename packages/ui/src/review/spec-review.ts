// SPDX-License-Identifier: Apache-2.0
import { DOCUMENT } from "@angular/common";
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  Injector,
  inject,
  input,
  linkedSignal,
  model,
  signal,
  viewChild,
} from "@angular/core";
import { LucideDynamicIcon, LucideMessageSquare, LucideTriangleAlert } from "@lucide/angular";
import { Button } from "../components/button";
import { Collapsible } from "../components/collapsible";
import type { ChangeView, CommentAnchor, ReviewSection } from "../data/records";
import { Preferences } from "../theme/preferences";
import { AssumptionRow } from "./assumption-row";
import { ReviewComments, SECTION_LABELS, selectionAnchor } from "./comments";
import { ReviewDelta } from "./delta-review";
import { Markdown } from "./markdown";
import { ReviewActions } from "./review-actions";
import { SECTION_META, sectionNumber, sectionProgress } from "./section-meta";
import { LIST, ReviewItems } from "./spec-sections";

/** How long the section picked in the index stays highlighted. */
const FLASH_MS = 1400;

/** After a pick in the index, the scroll it starts does not move the mark away from it. */
const PICK_MS = 1000;

/** A section counts as being read once its start is this far under the sticky bars. */
const READ_PX = 32;

/** The nearest ancestor that scrolls (the shell's main), or undefined when the page scrolls. */
function scrollParent(element: HTMLElement, view: Window): HTMLElement | undefined {
  for (let node = element.parentElement; node !== null; node = node.parentElement) {
    const { overflowY } = view.getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
  }
  return undefined;
}

/**
 * A section of the document. While `data-flash` is set (picked in the index), its divider
 * line draws across, its number darkens and its background lights up; all of it fades back.
 */
const SECTION =
  "group/section relative -mx-4 flex scroll-mt-[calc(var(--sp-sticky-top,0px)+1rem)] flex-col rounded-xl px-4 pt-4 pb-5 transition-colors duration-700 ease-out motion-reduce:transition-none data-flash:bg-phase-draft-bg";

/** The spec review (docs/ui.md) as a document: numbered sections, comments beside, one action bar. */
@Component({
  selector: "sp-spec-review",
  imports: [
    LucideDynamicIcon,
    Button,
    Collapsible,
    Markdown,
    AssumptionRow,
    ReviewItems,
    ReviewComments,
    ReviewDelta,
    ReviewActions,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Positioned, so absolute screen-reader text inside stays within the scrolling area.
  host: { class: "relative flex scroll-mt-[calc(var(--sp-sticky-top,0px)+1rem)] flex-col gap-6" },
  template: `
    <div class="flex flex-wrap items-start gap-x-12 gap-y-6">
      @if (mode() === 'full') {
        <nav class="sticky top-[calc(var(--sp-sticky-top,0px)+1rem)] flex flex-[1_1_170px] flex-col" [attr.aria-label]="t()('Secciones de la spec', 'Spec sections')">
          <p class="m-0 mb-2 px-2 text-xs font-medium tracking-[0.12em] text-text-muted uppercase" aria-hidden="true">{{ t()('Contenido', 'Contents') }}</p>
          @for (entry of index(); track entry.key; let i = $index) {
            <button type="button" class="flex cursor-pointer items-baseline gap-2.5 rounded-md border-0 bg-transparent px-2 py-1.5 text-left font-sans text-sm text-text-muted transition-colors hover:text-text aria-current:font-semibold aria-current:text-text" [attr.aria-current]="reading() === entry.key || null" (click)="go(entry.key)">
              <span class="w-5 shrink-0 font-mono text-[11px] font-normal text-text-muted" aria-hidden="true">{{ number(i) }}&ngsp;</span>
              <span class="flex-1">{{ label(entry.key) }}&ngsp;</span>
              @if (entry.pending + entry.warnings > 0) {
                <span class="flex items-center gap-0.5 font-mono text-[11px] font-normal" style="color: var(--color-phase-review)">
                  <svg [lucideIcon]="warningIcon" size="11" aria-hidden="true"></svg>{{ entry.pending + entry.warnings }}<span class="sr-only">&ngsp;{{ t()('por revisar', 'to check') }},&ngsp;</span>
                </span>
              }
              @if (entry.comments > 0) {
                <span class="flex items-center gap-0.5 font-mono text-[11px] font-normal">
                  <svg [lucideIcon]="commentIcon" size="11" aria-hidden="true"></svg>{{ entry.comments }}<span class="sr-only">&ngsp;{{ t()('comentarios', 'comments') }}</span>
                </span>
              }
            </button>
          }
        </nav>
      }

      <article #center class="flex min-w-0 flex-[999_1_480px] flex-col gap-6">
        @if (review().delta; as delta) {
          @if (mode() === 'delta') {
            <sp-review-delta [change]="change()" [delta]="delta" [editable]="inReview()" (comment)="anchor.set($event)" (showFull)="show('full')" />
          } @else {
            <p class="m-0 flex flex-wrap items-center gap-3 border-b border-border pb-4 text-sm text-text-muted">
              {{ t()('Estás viendo la spec completa de r', 'You are seeing the full spec of r') }}{{ change().revision }}.
              <sp-button size="sm" data-mode-toggle (pressed)="show('delta')">{{ t()('Ver solo los cambios desde r', 'See only the changes since r') }}{{ delta.approvedRevision }}</sp-button>
            </p>
          }
        }
        @for (entry of mode() === 'full' ? index() : []; track entry.key; let i = $index) {
          <section [class]="section" [id]="'review-' + entry.key" [attr.data-section]="entry.key" [attr.data-flash]="flashed() === entry.key || null" [attr.aria-labelledby]="'review-' + entry.key + '-title'">
            <div class="flex items-center gap-3 font-mono text-[11px] text-text-muted" data-divider>
              <span class="transition-colors duration-300 motion-reduce:transition-none group-data-flash/section:text-text">§ {{ number(i) }}</span>
              <span class="relative h-px flex-1 bg-border" aria-hidden="true">
                <span class="absolute -top-px left-0 h-0.5 w-0 bg-text transition-[width] duration-700 ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none group-data-flash/section:w-full"></span>
              </span>
              @if (progress(entry.key); as text) {
                <span data-progress>{{ text }}</span>
              }
            </div>
            <h2 class="mt-3 mb-0.5 text-[1.375rem] leading-tight font-semibold tracking-tight" tabindex="-1" [id]="'review-' + entry.key + '-title'">{{ label(entry.key) }}</h2>
            <p class="m-0 text-sm text-text-muted">{{ meta[entry.key].hint[lang()] }}</p>
            <div class="mt-4">
              @switch (entry.key) {
                @case ('goal') { <sp-markdown class="text-base leading-relaxed" [text]="review().goal" /> }
                @case ('outOfScope') { <sp-markdown class="text-base leading-relaxed" [text]="review().outOfScope" /> }
                @case ('assumptions') {
                  <div role="list" [class]="list">
                    @for (assumption of review().assumptions; track assumption.id) {
                      <sp-assumption-row [change]="change().id" [assumption]="assumption" [editable]="inReview()" (comment)="anchor.set($event)" />
                    }
                  </div>
                }
                @case ('design') {
                  <sp-collapsible [label]="t()('Ver el diseño', 'Show the design')"><sp-markdown [text]="review().design" /></sp-collapsible>
                }
                @default { <sp-review-items [review]="review()" [section]="itemSection(entry.key)" (comment)="anchor.set($event)" /> }
              }
            </div>
          </section>
        }
      </article>

      <aside class="sticky top-[calc(var(--sp-sticky-top,0px)+1rem)] flex-[1_1_260px]">
        <sp-review-comments [change]="change().id" [comments]="review().comments" [editable]="inReview()" [selection]="selection()" [(anchor)]="anchor" />
      </aside>
    </div>

    @if (inReview()) {
      <sp-review-actions [change]="change()" />
    }
  `,
})
export class SpecReview {
  readonly change = input.required<ChangeView>();
  /** The section being read: marked in the index and shown by the change's compact bar. */
  readonly reading = model<ReviewSection | undefined>(undefined);

  private readonly preferences = inject(Preferences);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly center = viewChild.required<ElementRef<HTMLElement>>("center");
  protected readonly t = this.preferences.t;
  protected readonly lang = this.preferences.lang;
  protected readonly meta = SECTION_META;
  protected readonly section = SECTION;
  protected readonly number = sectionNumber;
  protected readonly list = LIST;
  protected readonly warningIcon = LucideTriangleAlert;
  protected readonly commentIcon = LucideMessageSquare;
  protected readonly anchor = signal<CommentAnchor | undefined>(undefined);
  protected readonly selection = signal<CommentAnchor | undefined>(undefined);
  /** The section just picked in the index, highlighted for a moment. */
  protected readonly flashed = signal<ReviewSection | undefined>(undefined);
  private flashTimer: ReturnType<typeof setTimeout> | undefined;
  /** When a section was last picked in the index. */
  private pickedAt = 0;

  protected readonly review = computed(() => this.change().review);
  protected readonly index = computed(() => this.review().index.filter((entry) => entry.present));
  protected readonly inReview = computed(() => this.change().phase === "review");
  /**
   * With a delta, the review starts on the changes (docs/ui.md). Live updates of the same change
   * keep the person's choice; another change, or a delta appearing or going away, resets it.
   */
  protected readonly mode = linkedSignal<string, "delta" | "full">({
    source: () => `${this.change().id} ${this.review().delta !== undefined}`,
    computation: (key, previous) =>
      previous?.source === key ? previous.value : key.endsWith("true") ? "delta" : "full",
  });

  constructor() {
    const onSelection = () => this.selection.set(selectionAnchor(this.center().nativeElement));
    this.document.addEventListener("selectionchange", onSelection);
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => {
      this.document.removeEventListener("selectionchange", onSelection);
      clearTimeout(this.flashTimer);
    });
    // The section being read follows the scroll; a pick in the index wins while its scroll runs.
    afterNextRender(() => {
      const view = this.document.defaultView;
      if (view === null) return;
      const scroller = scrollParent(this.host, view);
      const target: EventTarget = scroller ?? view;
      const update = () => {
        if (Date.now() - this.pickedAt < PICK_MS) return;
        this.reading.set(this.readingAt(scroller, view));
      };
      target.addEventListener("scroll", update, { passive: true });
      destroyRef.onDestroy(() => target.removeEventListener("scroll", update));
      update();
    });
  }

  /** The last section whose start is under the sticky bars; at the page's end, the last one. */
  private readingAt(scroller: HTMLElement | undefined, view: Window): ReviewSection | undefined {
    const sections = [
      ...this.center().nativeElement.querySelectorAll<HTMLElement>("[data-section]"),
    ];
    const keys = sections.map((section) => section.dataset.section as ReviewSection);
    const box = scroller ?? view.document.documentElement;
    const scrolls = box.scrollHeight > box.clientHeight;
    if (scrolls && box.scrollTop + box.clientHeight >= box.scrollHeight - 2) return keys.at(-1);
    const sticky = view.getComputedStyle(this.host).getPropertyValue("--sp-sticky-top");
    const line =
      (scroller?.getBoundingClientRect().top ?? 0) +
      (Number(sticky.replace("px", "")) || 0) +
      READ_PX;
    let current = keys[0];
    sections.forEach((section, position) => {
      if (section.getBoundingClientRect().top <= line) current = keys[position];
    });
    return current;
  }

  protected label(key: ReviewSection): string {
    return SECTION_LABELS[key][this.lang()];
  }

  protected itemSection(key: ReviewSection): "criteria" | "files" | "tasks" | "risks" {
    return key === "files" || key === "tasks" || key === "risks" ? key : "criteria";
  }

  protected progress(key: ReviewSection): string {
    return sectionProgress(key, this.review(), this.t());
  }

  /** Scrolls to a section (smoothly unless the system asks for reduced motion) and highlights it. */
  protected go(key: ReviewSection): void {
    const section = this.host.querySelector<HTMLElement>(`#review-${key}`);
    const reduced = this.document.defaultView?.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    section?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    section?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    this.reading.set(key);
    this.pickedAt = Date.now();
    clearTimeout(this.flashTimer);
    this.flashed.set(key);
    this.flashTimer = setTimeout(() => this.flashed.set(undefined), FLASH_MS);
  }

  /** Switches between the changes and the full spec, and brings the view's top and toggle in. */
  protected show(mode: "delta" | "full"): void {
    this.mode.set(mode);
    afterNextRender(
      () => {
        this.host.scrollIntoView?.({ block: "start" });
        this.host
          .querySelector<HTMLElement>("[data-mode-toggle] button, sp-review-delta header button")
          ?.focus({ preventScroll: true });
      },
      { injector: this.injector },
    );
  }
}
