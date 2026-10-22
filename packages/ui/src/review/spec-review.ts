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
import { SECTION_META, sectionProgress } from "./section-meta";
import { LIST, ReviewItems, reportFailure } from "./spec-sections";

const CARD =
  "flex scroll-mt-[calc(var(--sp-sticky-top,0px)+1rem)] flex-col gap-4 rounded-xl border border-border bg-surface p-5";

/** The spec review (docs/ui.md): decisions first, comments beside, one action bar. */
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
    <div class="flex flex-wrap items-start gap-6">
      <nav class="sticky top-[calc(var(--sp-sticky-top,0px)+1rem)] flex flex-[1_1_170px] flex-col gap-1" [attr.aria-label]="t()('Secciones de la spec', 'Spec sections')">
        @for (entry of index(); track entry.key) {
          <button type="button" class="flex cursor-pointer items-center gap-2 rounded-lg border-0 bg-transparent px-2 py-1.5 text-left font-sans text-sm text-text-muted hover:bg-surface hover:text-text aria-current:bg-surface aria-current:font-medium aria-current:text-text aria-current:shadow-sm" [attr.aria-current]="current() === entry.key || null" (click)="go(entry.key)">
            <svg [lucideIcon]="meta[entry.key].icon" size="14" aria-hidden="true"></svg>
            <span class="flex-1">{{ label(entry.key) }}&ngsp;</span>
            @if (entry.pending + entry.warnings > 0) {
              <span class="flex items-center gap-0.5 text-xs" style="color: var(--color-phase-review)">
                <svg [lucideIcon]="warningIcon" size="12" aria-hidden="true"></svg>{{ entry.pending + entry.warnings }}<span class="sr-only">&ngsp;{{ t()('por revisar', 'to check') }},&ngsp;</span>
              </span>
            }
            @if (entry.comments > 0) {
              <span class="flex items-center gap-0.5 text-xs">
                <svg [lucideIcon]="commentIcon" size="12" aria-hidden="true"></svg>{{ entry.comments }}<span class="sr-only">&ngsp;{{ t()('comentarios', 'comments') }}</span>
              </span>
            }
          </button>
        }
      </nav>

      <div #center class="flex min-w-0 flex-[999_1_480px] flex-col gap-5">
        @for (entry of index(); track entry.key) {
          <section [class]="card" [id]="'review-' + entry.key" [attr.data-section]="entry.key" [attr.aria-labelledby]="'review-' + entry.key + '-title'">
            <header class="flex flex-col gap-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="flex size-8 items-center justify-center rounded-lg bg-bg"><svg [lucideIcon]="meta[entry.key].icon" size="16" aria-hidden="true"></svg></span>
                <h2 class="m-0 text-lg font-semibold" tabindex="-1" [id]="'review-' + entry.key + '-title'">{{ label(entry.key) }}</h2>
                @if (progress(entry.key); as text) {
                  <span class="ml-auto text-sm text-text-muted" data-progress>{{ text }}</span>
                }
              </div>
              <p class="m-0 text-sm text-text-muted">{{ meta[entry.key].hint[lang()] }}</p>
            </header>
            @switch (entry.key) {
              @case ('goal') { <sp-markdown [text]="review().goal" /> }
              @case ('outOfScope') { <sp-markdown [text]="review().outOfScope" /> }
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
          </section>
        }
      </div>

      <aside class="sticky top-[calc(var(--sp-sticky-top,0px)+1rem)] flex-[1_1_260px]">
        <sp-review-comments [change]="change().id" [comments]="review().comments" [editable]="inReview()" [selection]="selection()" [(anchor)]="anchor" />
      </aside>
    </div>

    @if (inReview()) {
      <div class="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-bg py-3" role="region" [attr.aria-label]="t()('Decisión sobre la spec', 'Decision on the spec')">
        @if (blocked(); as reason) {
          <p class="m-0 mr-auto flex items-center gap-2 text-sm" data-blocked>
            <svg [lucideIcon]="warningIcon" size="14" aria-hidden="true" style="color: var(--color-phase-review)"></svg>{{ reason }}
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
  protected readonly card = CARD;
  protected readonly list = LIST;
  protected readonly warningIcon = LucideTriangleAlert;
  protected readonly commentIcon = LucideMessageSquare;
  protected readonly anchor = signal<CommentAnchor | undefined>(undefined);
  protected readonly selection = signal<CommentAnchor | undefined>(undefined);
  /** The section being read, marked in the index. */
  protected readonly current = signal<ReviewSection | undefined>(undefined);

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
    destroyRef.onDestroy(() => this.document.removeEventListener("selectionchange", onSelection));
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
        this.current.set(this.index().find((item) => visible.has(item.key))?.key);
      });
      for (const section of this.center().nativeElement.querySelectorAll("[data-section]"))
        observer.observe(section);
      destroyRef.onDestroy(() => observer.disconnect());
    });
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

  /** Scrolls to a section, smoothly unless the system asks for reduced motion. */
  protected go(key: ReviewSection): void {
    const section = this.host.querySelector<HTMLElement>(`#review-${key}`);
    const reduced = this.document.defaultView?.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    section?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    section?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    this.current.set(key);
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
