// SPDX-License-Identifier: Apache-2.0
import { DOCUMENT } from "@angular/common";
import {
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
import {
  type ChangeView,
  type CommentAnchor,
  type ReviewSection,
  SpectyData,
} from "../data/records";
import { Preferences } from "../theme/preferences";
import { ReviewComments, SECTION_LABELS, selectionAnchor } from "./comments";
import { Markdown } from "./markdown";
import { AssumptionCard, ReviewItems, reportFailure } from "./spec-sections";

/** The spec review (docs/ui.md): decisions first, comments beside, one action bar. */
@Component({
  selector: "sp-spec-review",
  imports: [
    LucideDynamicIcon,
    Button,
    Collapsible,
    Markdown,
    AssumptionCard,
    ReviewItems,
    ReviewComments,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "flex flex-col gap-6" },
  template: `
    <div class="flex flex-wrap items-start gap-6">
      <nav class="sticky top-0 flex flex-[1_1_160px] flex-col gap-1 py-1" [attr.aria-label]="t()('Secciones de la spec', 'Spec sections')">
        @for (entry of index(); track entry.key) {
          <button type="button" class="flex cursor-pointer items-center justify-between gap-2 rounded-lg border-0 bg-transparent px-2 py-1 text-left font-sans text-sm text-text-muted hover:bg-surface hover:text-text" (click)="go(entry.key)">
            {{ label(entry.key) }}
            <span class="flex items-center gap-1 text-xs">
              @if (entry.pending + entry.warnings > 0) {
                <svg [lucideIcon]="warningIcon" size="12" aria-hidden="true" style="color: var(--color-phase-review)"></svg>
                <span>{{ entry.pending + entry.warnings }}<span class="sr-only">&ngsp;{{ t()('por revisar', 'to check') }},&ngsp;</span></span>
              }
              @if (entry.comments > 0) {
                <svg [lucideIcon]="commentIcon" size="12" aria-hidden="true"></svg>
                <span>{{ entry.comments }}<span class="sr-only">&ngsp;{{ t()('comentarios', 'comments') }}</span></span>
              }
            </span>
          </button>
        }
      </nav>

      <div #center class="flex min-w-0 flex-[999_1_480px] flex-col gap-8">
        @for (entry of index(); track entry.key) {
          <section class="flex flex-col gap-3" [id]="'review-' + entry.key" [attr.data-section]="entry.key" [attr.aria-labelledby]="'review-' + entry.key + '-title'">
            @switch (entry.key) {
              @case ('design') {
                <sp-collapsible [label]="label('design')">
                  <sp-markdown [text]="review().design" />
                </sp-collapsible>
              }
              @default {
                <h2 class="m-0 text-lg font-semibold" tabindex="-1" [id]="'review-' + entry.key + '-title'">{{ label(entry.key) }}</h2>
                @switch (entry.key) {
                  @case ('goal') { <sp-markdown [text]="review().goal" /> }
                  @case ('outOfScope') { <sp-markdown [text]="review().outOfScope" /> }
                  @case ('assumptions') {
                    @for (assumption of review().assumptions; track assumption.id) {
                      <sp-assumption-card [change]="change().id" [assumption]="assumption" [editable]="inReview()" (comment)="anchor.set($event)" />
                    }
                  }
                  @case ('criteria') { <sp-review-items [review]="review()" section="criteria" (comment)="anchor.set($event)" /> }
                  @case ('files') { <sp-review-items [review]="review()" section="files" (comment)="anchor.set($event)" /> }
                  @case ('tasks') { <sp-review-items [review]="review()" section="tasks" (comment)="anchor.set($event)" /> }
                  @case ('risks') { <sp-review-items [review]="review()" section="risks" (comment)="anchor.set($event)" /> }
                }
              }
            }
          </section>
        }
      </div>

      <aside class="flex-[1_1_260px]">
        <sp-review-comments [change]="change().id" [comments]="review().comments" [editable]="inReview()" [selection]="selection()" [(anchor)]="anchor" />
      </aside>
    </div>

    @if (inReview()) {
      <div class="sticky bottom-0 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-bg py-3" role="region" [attr.aria-label]="t()('Decisión sobre la spec', 'Decision on the spec')">
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
  private readonly failed = reportFailure(this.toasts, this.preferences);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly center = viewChild.required<ElementRef<HTMLElement>>("center");
  protected readonly t = this.preferences.t;
  protected readonly warningIcon = LucideTriangleAlert;
  protected readonly commentIcon = LucideMessageSquare;
  protected readonly anchor = signal<CommentAnchor | undefined>(undefined);
  protected readonly selection = signal<CommentAnchor | undefined>(undefined);

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
    const document = inject(DOCUMENT);
    const onSelection = () => this.selection.set(selectionAnchor(this.center().nativeElement));
    document.addEventListener("selectionchange", onSelection);
    inject(DestroyRef).onDestroy(() =>
      document.removeEventListener("selectionchange", onSelection),
    );
  }

  protected label(key: ReviewSection): string {
    return SECTION_LABELS[key][this.preferences.lang()];
  }

  protected go(key: ReviewSection): void {
    const section = this.host.querySelector<HTMLElement>(`#review-${key}`);
    section?.scrollIntoView({ block: "start" });
    section?.querySelector<HTMLElement>("h2, button")?.focus({ preventScroll: true });
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
