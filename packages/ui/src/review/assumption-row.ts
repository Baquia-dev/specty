// SPDX-License-Identifier: Apache-2.0
import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  Injector,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from "@angular/core";
import { LucideDynamicIcon } from "@lucide/angular";
import { Button, IconButton } from "../components/button";
import { DialogFrame, Dialogs } from "../components/dialog";
import { REVEAL, ROW } from "../components/document";
import { Field } from "../components/field";
import {
  LucideCircleCheck,
  LucideCircleDashed,
  LucideCircleX,
  LucideMessageSquarePlus,
} from "../components/icons";
import { Toasts } from "../components/toast";
import {
  type AssumptionView,
  type CommentAnchor,
  type CommentView,
  type DiffPart,
  SpectyData,
} from "../data/records";
import { Preferences } from "../theme/preferences";
import { BeforeLine, reportFailure, WordDiff } from "./spec-sections";

/** Reason is required: the agent reads it in `specty next`. */
@Component({
  selector: "sp-reject-assumption",
  imports: [DialogFrame, Field, Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sp-dialog #frame [heading]="t()('Rechazar ' + data.id, 'Reject ' + data.id)" [description]="data.text">
      <sp-field [label]="t()('Motivo', 'Reason')" [multiline]="true" [(value)]="reason" />
      <sp-button actions (pressed)="frame.close()">{{ t()('Cancelar', 'Cancel') }}</sp-button>
      <sp-button
        actions
        variant="primary"
        [disabledReason]="reason().trim() ? '' : t()('Escribe el motivo: el agente lo leerá.', 'Write the reason: the agent will read it.')"
        (pressed)="reject()"
      >
        {{ t()('Rechazar', 'Reject') }}
      </sp-button>
    </sp-dialog>
  `,
})
class RejectAssumption {
  protected readonly data = inject<{ change: string; id: string; text: string }>(DIALOG_DATA);
  private readonly ref = inject(DialogRef);
  private readonly source = inject(SpectyData);
  private readonly failed = reportFailure(inject(Toasts), inject(Preferences));
  protected readonly t = inject(Preferences).t;
  protected readonly reason = signal("");

  protected reject(): void {
    this.source
      .decideAssumption(this.data.change, this.data.id, "rejected", this.reason().trim())
      .then(() => this.ref.close(), this.failed);
  }
}

/** Each decision with its icon and the phase color that reads like it (never color alone). */
const DECISIONS = {
  pending: { icon: LucideCircleDashed, tone: "review" },
  implicit: { icon: LucideCircleDashed, tone: "draft" },
  confirmed: { icon: LucideCircleCheck, tone: "done" },
  rejected: { icon: LucideCircleX, tone: "cancelled" },
} as const;

/** An assumption as a document row: confirm or reject it in review. */
@Component({
  selector: "sp-assumption-row",
  imports: [LucideDynamicIcon, Button, IconButton, WordDiff, BeforeLine],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: "listitem",
    "[class]": "row",
    "[attr.data-item]": "assumption().id",
    "[attr.data-waiting]": "waiting() || null",
    // A high-impact assumption still undecided reads on a faint tint, besides its chip.
    "[style.background]":
      "waiting() ? 'color-mix(in oklab, var(--color-phase-review-bg) 55%, transparent)' : null",
  },
  template: `
    <span class="pt-0.5 font-mono text-xs text-text-muted">{{ assumption().id }}</span>
    <div class="flex min-w-0 flex-col gap-1">
      <!-- In the delta, what happened to it (added, modified) goes first… -->
      <ng-content select="[data-mark]" />
      @if (diff(); as parts) {
        <sp-word-diff class="block" [parts]="parts" />
      } @else {
        <p class="m-0" [class.text-text-muted]="assumption().decision === 'rejected'">{{ assumption().text }}</p>
      }
      @if (before(); as parts) {
        <sp-before-line [parts]="parts" />
      }
      <!-- …and what changed without text of its own (its impact) goes after it. -->
      <ng-content />
      @if (assumption().impact === 'high') {
        <span class="text-xs text-text-muted">{{ t()('Alto impacto', 'High impact') }}</span>
      }
      @if (assumption().comment; as reason) {
        <p class="m-0 mt-1 border-l-2 border-border pl-3 text-sm text-text-muted">{{ t()('Motivo', 'Reason') }}: «{{ reason }}»</p>
      }
      @if (editable()) {
        @if (assumption().decision === 'pending' || reconsidering()) {
          <div class="mt-2 flex gap-2" data-choices>
            <sp-button size="sm" variant="primary" [disabledReason]="commentBlocked()" (pressed)="confirm()">{{ t()('Confirmar', 'Confirm') }}</sp-button>
            <sp-button size="sm" [disabledReason]="commentBlocked()" (pressed)="reject()">{{ t()('Rechazar…', 'Reject…') }}</sp-button>
          </div>
        } @else {
          <!-- Already decided: the choices stay out of the way until the person asks for them. -->
          <sp-button class="mt-1 self-start" size="sm" variant="ghost" [disabledReason]="commentBlocked()" (pressed)="reconsider()">{{ t()('Cambiar decisión', 'Change decision') }}</sp-button>
        }
      }
    </div>
    <div class="flex items-start gap-1">
      <span class="flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-medium whitespace-nowrap" [style.color]="'var(--color-phase-' + decisions[assumption().decision].tone + ')'" [style.background]="'var(--color-phase-' + decisions[assumption().decision].tone + '-bg)'" data-decision>
        <svg [lucideIcon]="decisions[assumption().decision].icon" size="13" aria-hidden="true"></svg>{{ decisionLabel() }}
      </span>
      @if (editable()) {
        <sp-icon-button [class]="reveal" size="sm" [label]="t()('Comentar ' + assumption().id, 'Comment on ' + assumption().id)" [icon]="commentIcon" (pressed)="comment.emit({ item: assumption().id })" />
      }
    </div>
  `,
})
export class AssumptionRow {
  readonly assumption = input.required<AssumptionView>();
  readonly change = input.required<string>();
  readonly editable = input(false);
  readonly comments = input<readonly CommentView[]>([]);
  /** In the delta: its final text, with the words added since the approved revision. */
  readonly diff = input<readonly DiffPart[] | undefined>(undefined);
  /** In the delta, only if words were removed: what it said before. */
  readonly before = input<readonly DiffPart[] | undefined>(undefined);
  readonly comment = output<CommentAnchor>();

  private readonly source = inject(SpectyData);
  private readonly dialogs = inject(Dialogs);
  private readonly failed = reportFailure(inject(Toasts), inject(Preferences));
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  protected readonly t = inject(Preferences).t;
  protected readonly row = ROW;
  protected readonly reveal = REVEAL;
  protected readonly decisions = DECISIONS;
  /** A high-impact assumption still undecided: approval waits for it. */
  protected readonly waiting = computed(
    () => this.assumption().impact === "high" && this.assumption().decision === "pending",
  );
  /** Open comments anchored to this assumption disable deciding on it. */
  protected readonly commentBlocked = computed(() => {
    const id = this.assumption().id;
    const text = this.assumption().text;
    const hasOpen = this.comments().some(
      (c) =>
        !c.resolved &&
        (("item" in c.anchor && c.anchor.item === id) ||
          ("quote" in c.anchor && c.anchor.section === "assumptions" && text.includes(c.anchor.quote))),
    );
    return hasOpen
      ? this.t()(
          "Tiene comentarios pendientes: edítalos, elimínalos o pide cambios.",
          "Has pending comments: edit, delete them or request changes.",
        )
      : "";
  });
  /**
   * The person asked to change a decision already taken. A new decision folds the choices away
   * again; live updates that keep the same decision leave them open.
   */
  protected readonly reconsidering = linkedSignal<string, boolean>({
    source: () => this.assumption().decision,
    computation: (decision, previous) => (previous?.source === decision ? previous.value : false),
  });
  protected readonly commentIcon = LucideMessageSquarePlus;
  protected readonly decisionLabel = computed(() => {
    const t = this.t();
    return {
      pending: t("Por decidir", "To decide"),
      implicit: t("Aceptado con la spec", "Accepted with the spec"),
      confirmed: t("Confirmado", "Confirmed"),
      rejected: t("Rechazado", "Rejected"),
    }[this.assumption().decision];
  });

  /** Shows the choices again and moves focus to the first, since the pressed button goes away. */
  protected reconsider(): void {
    this.reconsidering.set(true);
    afterNextRender(() => this.host.querySelector<HTMLElement>("[data-choices] button")?.focus(), {
      injector: this.injector,
    });
  }

  protected confirm(): void {
    this.source
      .decideAssumption(this.change(), this.assumption().id, "confirmed")
      .catch(this.failed);
  }

  protected reject(): void {
    const { id, text } = this.assumption();
    this.dialogs.open(RejectAssumption, { change: this.change(), id, text });
  }
}
