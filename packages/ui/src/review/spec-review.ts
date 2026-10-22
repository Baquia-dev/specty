// SPDX-License-Identifier: Apache-2.0
import { DOCUMENT } from "@angular/common";
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  model,
  signal,
  viewChild,
} from "@angular/core";
import { LucideDynamicIcon, LucideMessageSquare, LucideTriangleAlert } from "@lucide/angular";
import { Button } from "../components/button";
import { Collapsible } from "../components/collapsible";
import { Toasts } from "../components/toast";
import type { ChangeView, CommentAnchor, ReviewSection } from "../data/records";
import { SpectyData } from "../data/records";
import { Preferences } from "../theme/preferences";
import { AssumptionRow } from "./assumption-row";
import { ReviewComments, SECTION_LABELS, selectionAnchor } from "./comments";
import { Markdown } from "./markdown";
import { SECTION_META, sectionNumber, sectionProgress } from "./section-meta";
import { LIST, ReviewItems, reportFailure } from "./spec-sections";

/** How long the section picked in the index stays highlighted. */
const FLASH_MS = 1400;

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
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "flex flex-col gap-6" },
  template: `
    <div class="flex flex-wrap items-start gap-x-12 gap-y-6">
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

      <article #center class="flex min-w-0 flex-[999_1_480px] flex-col gap-6">
        @for (entry of index(); track entry.key; let i = $index) {
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
      <div class="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-bg/90 py-3 backdrop-blur" role="region" [attr.aria-label]="t()('Decisión sobre la spec', 'Decision on the spec')">
        @if (blocked(); as reason) {
          <p class="m-0 mr-auto flex items-center gap-2 text-sm" style="color: var(--color-phase-review)" data-blocked>
            <svg [lucideIcon]="warningIcon" size="14" aria-hidden="true"></svg>{{ reason }}
          </p>
        }
        <sp-button [disabledReason]="openComments() ? '' : t()('Escribe al menos un comentario para pedir cambios.', 'Write at least one comment to request changes.')" (pressed)="requestChanges()">
          {{ t()('Pedir cambios', 'Request changes') }}
        </sp-button>
        <sp-button variant="primary" [disabledReason]="blocked()" (pressed)="approve()">
          {{ t()('Aprobar r', 'Approve r') }}{{ change().revision }}
        </sp-button>
      </div>
    }
  `,
})
export class SpecReview {
  readonly change = input.required<ChangeView>();
  /** The section being read: marked in the index and shown by the change's compact bar. */
  readonly reading = model<ReviewSection | undefined>(undefined);

  private readonly source = inject(SpectyData);
  private readonly toasts = inject(Toasts);
  private readonly preferences = inject(Preferences);
  private readonly document = inject(DOCUMENT);
  private readonly failed = reportFailure(this.toasts, this.preferences);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly center = viewChild.required<ElementRef<HTMLElement>>("center");
  protected readonly t = this.preferences.t;
  protected readonly lang = this.preferences.lang;
  protected readonly meta = SECTION_META;
  protected readonly section = SECTION;
  protected readonly list = LIST;
  protected readonly warningIcon = LucideTriangleAlert;
  protected readonly commentIcon = LucideMessageSquare;
  protected readonly anchor = signal<CommentAnchor | undefined>(undefined);
  protected readonly selection = signal<CommentAnchor | undefined>(undefined);
  /** The section just picked in the index, highlighted for a moment. */
  protected readonly flashed = signal<ReviewSection | undefined>(undefined);
  private flashTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly review = computed(() => this.change().review);
  protected readonly index = computed(() => this.review().index.filter((entry) => entry.present));
  protected readonly inReview = computed(() => this.change().phase === "review");
  protected readonly openComments = computed(
    () => this.review().comments.filter((comment) => !comment.resolved).length,
  );
  /** Why approving must wait, if it must: shown in the tooltip and as visible text. */
  protected readonly blocked = computed(() => {
    const t = this.t();
    const pending = this.change().highImpactPending;
    const errors = this.review().errors.length;
    if (pending > 0) {
      return pending === 1
        ? t(
            "Falta 1 supuesto de alto impacto por decidir.",
            "1 high-impact assumption is still undecided.",
          )
        : t(
            `Faltan ${pending} supuestos de alto impacto por decidir.`,
            `${pending} high-impact assumptions are still undecided.`,
          );
    }
    if (errors > 0)
      return t(
        `La spec tiene ${errors} errores de validación.`,
        `The spec has ${errors} validation errors.`,
      );
    return "";
  });

  constructor() {
    const onSelection = () => this.selection.set(selectionAnchor(this.center().nativeElement));
    this.document.addEventListener("selectionchange", onSelection);
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => {
      this.document.removeEventListener("selectionchange", onSelection);
      clearTimeout(this.flashTimer);
    });
    // The index marks the topmost section in view.
    afterNextRender(() => {
      if (typeof IntersectionObserver === "undefined") return;
      const visible = new Set<ReviewSection>();
      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          const key = (entry.target as HTMLElement).dataset.section as ReviewSection;
          if (entry.isIntersecting) visible.add(key);
          else visible.delete(key);
        }
        this.reading.set(this.index().find((item) => visible.has(item.key))?.key);
      });
      for (const section of this.center().nativeElement.querySelectorAll("[data-section]"))
        observer.observe(section);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  protected label(key: ReviewSection): string {
    return SECTION_LABELS[key][this.lang()];
  }

  protected number(position: number): string {
    return sectionNumber(position);
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
    clearTimeout(this.flashTimer);
    this.flashed.set(key);
    this.flashTimer = setTimeout(() => this.flashed.set(undefined), FLASH_MS);
  }

  protected requestChanges(): void {
    this.source.requestChanges(this.change().id).then(() => {
      this.toasts.show(
        this.t()(
          "Comentarios enviados: el agente los leerá en specty next.",
          "Comments sent: the agent will read them in specty next.",
        ),
        "success",
      );
    }, this.failed);
  }

  protected approve(): void {
    const { id, revision } = this.change();
    this.source.approve(id, revision).then(() => {
      this.toasts.show(
        this.t()(`Revisión ${revision} aprobada.`, `Revision ${revision} approved.`),
        "success",
      );
    }, this.failed);
  }
}
