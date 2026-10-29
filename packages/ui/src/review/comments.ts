// SPDX-License-Identifier: Apache-2.0
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  model,
  signal,
} from "@angular/core";
import { LucideDynamicIcon } from "@lucide/angular";
import { Button } from "../components/button";
import { Field } from "../components/field";
import { LucideQuote } from "../components/icons";
import { ItemText } from "../components/item-tooltip";
import { Toasts } from "../components/toast";
import {
  type Bilingual,
  type CommentAnchor,
  type CommentView,
  type ReviewSection,
  relativeTime,
  SpectyData,
} from "../data/records";
import { Preferences } from "../theme/preferences";
import { reportFailure } from "./spec-sections";

export const SECTION_LABELS: Readonly<Record<ReviewSection, Bilingual>> = {
  goal: { es: "Objetivo", en: "Goal" },
  outOfScope: { es: "Fuera de alcance", en: "Out of scope" },
  assumptions: { es: "Supuestos", en: "Assumptions" },
  criteria: { es: "Criterios", en: "Criteria" },
  files: { es: "Archivos", en: "Files" },
  tasks: { es: "Tareas", en: "Tasks" },
  risks: { es: "Riesgos", en: "Risks" },
  design: { es: "Diseño", en: "Design" },
};

const MAX_QUOTE = 200;

/**
 * The text selected inside one section of `root` (`[data-section]`), as a comment anchor.
 * A selection across sections, or outside `root`, anchors nothing.
 */
export function selectionAnchor(root: HTMLElement): CommentAnchor | undefined {
  const selection = root.ownerDocument.getSelection();
  const quote = selection?.toString().replace(/\s+/g, " ").trim() ?? "";
  if (selection === null || selection.rangeCount === 0 || quote.length === 0) return undefined;
  const sectionOf = (node: Node | null) =>
    (node instanceof Element ? node : node?.parentElement)?.closest<HTMLElement>("[data-section]");
  const start = sectionOf(selection.anchorNode);
  if (start === null || start === undefined || !root.contains(start)) return undefined;
  if (sectionOf(selection.focusNode) !== start) return undefined;
  const section = start.dataset.section as ReviewSection;
  return { section, quote: quote.slice(0, MAX_QUOTE) };
}

/** The review's comments and the composer for a new one, anchored to an item or a quote. */
@Component({
  selector: "sp-review-comments",
  imports: [LucideDynamicIcon, Button, Field, ItemText],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "flex flex-col gap-3" },
  template: `
    <h2 class="m-0 flex items-baseline justify-between text-xs font-medium tracking-[0.12em] text-text-muted uppercase">
      {{ t()('Comentarios', 'Comments') }}&ngsp;<span class="font-mono tracking-normal">{{ open() }}</span>
    </h2>

    @if (editable()) {
      @if (anchor(); as target) {
        <form class="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3" (submit)="$event.preventDefault()">
          <p class="m-0 text-sm text-text-muted" data-target><sp-item-text [text]="anchorLabel(target)" /></p>
          <sp-field [label]="t()('Comentario', 'Comment')" [multiline]="true" [(value)]="body" />
          <div class="flex justify-end gap-2">
            <sp-button size="sm" variant="ghost" (pressed)="cancel()">{{ t()('Cancelar', 'Cancel') }}</sp-button>
            <sp-button size="sm" variant="primary" [disabledReason]="body().trim() ? '' : t()('Escribe el comentario.', 'Write the comment.')" (pressed)="send(target)">
              {{ t()('Comentar', 'Comment') }}
            </sp-button>
          </div>
        </form>
      } @else if (selection(); as quoted) {
        <sp-button size="sm" (pressed)="anchor.set(quoted)">
          <svg [lucideIcon]="quoteIcon" size="14" aria-hidden="true"></svg>
          {{ t()('Comentar la selección', 'Comment on the selection') }}
        </sp-button>
      } @else {
        <p class="m-0 text-sm text-text-muted">
          {{ t()('Selecciona texto o pasa por un ítem para comentarlo.', 'Select text or hover an item to comment on it.') }}
        </p>
      }
    }

    <ul class="m-0 flex list-none flex-col p-0">
      @for (comment of comments(); track comment.id) {
        <li class="flex flex-col gap-1 border-b border-border py-3 text-sm first:pt-0" [class.opacity-60]="comment.resolved" [attr.data-comment]="comment.id">
          <span class="font-mono text-[11px] text-text-muted"><sp-item-text [text]="anchorLabel(comment.anchor)" /></span>
          <p class="m-0 leading-normal"><sp-item-text [text]="comment.body" /></p>
          <span class="text-xs text-text-muted">
            {{ comment.author }} · {{ since(comment.createdAt) }} · {{ t()('en la revisión ', 'on revision ') }}{{ comment.revision }}
            @if (comment.resolvedInRevision) {
              · {{ t()('resuelto en la ', 'resolved in revision ') }}{{ comment.resolvedInRevision }}
            }
          </span>
        </li>
      } @empty {
        <li class="text-sm text-text-muted">{{ t()('Sin comentarios.', 'No comments.') }}</li>
      }
    </ul>
  `,
})
export class ReviewComments {
  readonly change = input.required<string>();
  readonly comments = input.required<readonly CommentView[]>();
  readonly editable = input(false);
  /** What a new comment points to; set by the review when the person picks an item. */
  readonly anchor = model<CommentAnchor | undefined>(undefined);
  /** The current text selection, offered as a quote to comment on. */
  readonly selection = input<CommentAnchor | undefined>(undefined);

  private readonly source = inject(SpectyData);
  private readonly preferences = inject(Preferences);
  private readonly failed = reportFailure(inject(Toasts), this.preferences);
  protected readonly t = this.preferences.t;
  protected readonly quoteIcon = LucideQuote;
  protected readonly body = signal("");
  protected readonly open = computed(
    () => this.comments().filter((comment) => !comment.resolved).length,
  );

  protected anchorLabel(anchor: CommentAnchor): string {
    const t = this.t();
    if ("item" in anchor) return t(`Sobre ${anchor.item}`, `On ${anchor.item}`);
    const section = SECTION_LABELS[anchor.section][this.preferences.lang()];
    return `${section}: «${anchor.quote}»`;
  }

  protected since(iso: string): string {
    return relativeTime(iso, Date.now(), this.preferences.lang());
  }

  protected cancel(): void {
    this.anchor.set(undefined);
    this.body.set("");
  }

  protected send(anchor: CommentAnchor): void {
    this.source
      .addComment(this.change(), anchor, this.body().trim())
      .then(() => this.cancel(), this.failed);
  }
}
