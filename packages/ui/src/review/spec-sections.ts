// SPDX-License-Identifier: Apache-2.0
import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
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
  LucideArrowRight,
  LucideCircleCheck,
  LucideCircleDashed,
  LucideCircleX,
  LucideDynamicIcon,
  LucideMessageSquarePlus,
  LucidePencil,
  LucidePlus,
  LucideShieldAlert,
  LucideTrash2,
  LucideTriangleAlert,
} from "@lucide/angular";
import { Badge } from "../components/badge";
import { Button, IconButton } from "../components/button";
import { DialogFrame, Dialogs } from "../components/dialog";
import { Field } from "../components/field";
import { Toasts } from "../components/toast";
import {
  ActionError,
  type AssumptionView,
  type CommentAnchor,
  type FileView,
  type ReviewView,
  SpectyData,
  type TaskItemView,
} from "../data/records";
import { Preferences } from "../theme/preferences";

/** Shows an action's failure as an error toast, in the current language. */
export function reportFailure(toasts: Toasts, preferences: Preferences) {
  return (error: unknown) => {
    const text = error instanceof ActionError ? error.text[preferences.lang()] : String(error);
    toasts.show(text, "error");
  };
}

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
export class RejectAssumption {
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

/** An assumption to confirm or reject (only in review). */
@Component({
  selector: "sp-assumption-card",
  imports: [LucideDynamicIcon, Badge, Button, IconButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: "group flex flex-col gap-2 rounded-xl border border-border bg-bg p-4",
    "[attr.data-item]": "assumption().id",
    "[style.border-color]": "waiting() ? 'var(--color-phase-review)' : null",
  },
  template: `
    <div class="flex flex-wrap items-center gap-2">
      <sp-badge>{{ assumption().id }}</sp-badge>
      @if (assumption().impact === 'high') {
        <span class="flex items-center gap-1 text-xs font-medium" style="color: var(--color-phase-review)">
          <svg [lucideIcon]="warning" size="13" aria-hidden="true"></svg>{{ t()('Alto impacto', 'High impact') }}
        </span>
      }
      <span class="ml-auto flex h-6 items-center gap-1 rounded-md px-2 text-xs font-medium" [style.color]="'var(--color-phase-' + decisions[assumption().decision].tone + ')'" [style.background]="'var(--color-phase-' + decisions[assumption().decision].tone + '-bg)'" data-decision>
        <svg [lucideIcon]="decisions[assumption().decision].icon" size="13" aria-hidden="true"></svg>{{ decisionLabel() }}
      </span>
      <sp-icon-button class="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100" size="sm" [label]="t()('Comentar ' + assumption().id, 'Comment on ' + assumption().id)" [icon]="commentIcon" (pressed)="comment.emit({ item: assumption().id })" />
    </div>
    <p class="m-0">{{ assumption().text }}</p>
    @if (assumption().comment; as reason) {
      <p class="m-0 text-sm text-text-muted">{{ t()('Motivo', 'Reason') }}: «{{ reason }}»</p>
    }
    @if (editable()) {
      <div class="flex gap-2">
        <sp-button size="sm" (pressed)="confirm()">{{ t()('Confirmar', 'Confirm') }}</sp-button>
        <sp-button size="sm" (pressed)="reject()">{{ t()('Rechazar…', 'Reject…') }}</sp-button>
      </div>
    }
  `,
})
export class AssumptionCard {
  readonly assumption = input.required<AssumptionView>();
  readonly change = input.required<string>();
  readonly editable = input(false);
  readonly comment = output<CommentAnchor>();

  private readonly source = inject(SpectyData);
  private readonly dialogs = inject(Dialogs);
  private readonly failed = reportFailure(inject(Toasts), inject(Preferences));
  protected readonly t = inject(Preferences).t;
  protected readonly decisions = DECISIONS;
  /** A high-impact assumption still undecided: approval waits for it. */
  protected readonly waiting = computed(
    () => this.assumption().impact === "high" && this.assumption().decision === "pending",
  );
  protected readonly warning = LucideTriangleAlert;
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

const ACTIONS = {
  create: { icon: LucidePlus, es: "Crear", en: "Create" },
  modify: { icon: LucidePencil, es: "Modificar", en: "Modify" },
  delete: { icon: LucideTrash2, es: "Borrar", en: "Delete" },
  rename: { icon: LucideArrowRight, es: "Renombrar", en: "Rename" },
} as const;

const STATUS = {
  pending: { icon: LucideCircleDashed, es: "Pendiente", en: "Pending" },
  active: { icon: LucideArrowRight, es: "Activa", en: "Active" },
  done: { icon: LucideCircleCheck, es: "Hecha", en: "Done" },
} as const;

/** Criteria, files by module, tasks and risks: each item can be commented on. */
@Component({
  selector: "sp-review-items",
  imports: [LucideDynamicIcon, Badge, IconButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (section()) {
      @case ('criteria') {
        <ul class="m-0 flex list-none flex-col gap-2 p-0">
          @for (criterion of review().criteria; track criterion.id) {
            <li class="group flex flex-col gap-1" [attr.data-item]="criterion.id">
              <div class="flex items-start gap-2">
                <sp-badge>{{ criterion.id }}</sp-badge>
                <span class="flex-1">{{ criterion.text }}</span>
                <sp-icon-button [class]="reveal" size="sm" [label]="commentLabel(criterion.id)" [icon]="commentIcon" (pressed)="comment.emit({ item: criterion.id })" />
              </div>
              @for (warning of criterion.warnings; track $index) {
                <p class="m-0 flex items-center gap-2 text-sm" role="note">
                  <svg [lucideIcon]="warningIcon" size="14" aria-hidden="true" style="color: var(--color-phase-review)"></svg>{{ warning[lang()] }}
                </p>
              }
            </li>
          }
        </ul>
      }
      @case ('files') {
        @for (group of review().files; track group.module) {
          <h3 class="mt-0 mb-2 font-mono text-sm text-text-muted">{{ group.module }}/</h3>
          <ul class="m-0 mb-4 flex list-none flex-col gap-1 p-0">
            @for (file of group.files; track file.path) {
              <li class="flex flex-wrap items-center gap-2 text-sm">
                <span class="flex w-28 items-center gap-1 text-xs font-medium" [attr.data-action]="file.action">
                  <svg [lucideIcon]="actions[file.action].icon" size="13" aria-hidden="true"></svg>{{ actionLabel(file) }}
                </span>
                <code class="font-mono text-xs">{{ file.from ? file.from + ' → ' : '' }}{{ file.path }}</code>
                @if (file.sensitive) {
                  <span class="flex items-center gap-1 text-xs font-medium" style="color: var(--color-phase-review)" data-sensitive>
                    <svg [lucideIcon]="sensitiveIcon" size="13" aria-hidden="true"></svg>{{ t()('Ruta sensible', 'Sensitive path') }}
                  </span>
                }
                @if (file.reason) {
                  <span class="text-text-muted">— {{ file.reason }}</span>
                }
              </li>
            }
          </ul>
        }
      }
      @case ('tasks') {
        <ol class="m-0 flex list-none flex-col gap-3 p-0">
          @for (task of review().tasks; track task.id) {
            <li class="group flex flex-col gap-1" [attr.data-item]="task.id">
              <div class="flex items-center gap-2">
                <sp-badge>{{ task.id }}</sp-badge>
                <span class="flex-1 font-medium">{{ task.title }}</span>
                <span class="flex items-center gap-1 text-xs text-text-muted" data-status>
                  <svg [lucideIcon]="status[task.status].icon" size="13" aria-hidden="true"></svg>{{ statusLabel(task) }}
                </span>
                <sp-icon-button [class]="reveal" size="sm" [label]="commentLabel(task.id)" [icon]="commentIcon" (pressed)="comment.emit({ item: task.id })" />
              </div>
              <div class="flex flex-wrap gap-1">
                @for (criterion of task.ac; track criterion) {
                  <sp-badge>{{ criterion }}</sp-badge>
                }
                @for (path of task.files; track path) {
                  <code class="rounded-sm border border-border px-1 font-mono text-xs">{{ path }}</code>
                }
              </div>
              @for (warning of task.warnings; track $index) {
                <p class="m-0 flex items-center gap-2 text-sm" role="note">
                  <svg [lucideIcon]="warningIcon" size="14" aria-hidden="true" style="color: var(--color-phase-review)"></svg>{{ warning[lang()] }}
                </p>
              }
            </li>
          }
        </ol>
      }
      @case ('risks') {
        <ul class="m-0 flex list-none flex-col gap-2 p-0">
          @for (risk of review().risks; track risk.id) {
            <li class="group flex items-start gap-2" [attr.data-item]="risk.id">
              <sp-badge>{{ risk.id }}</sp-badge>
              <span class="flex-1">{{ risk.text }}</span>
              <sp-icon-button [class]="reveal" size="sm" [label]="commentLabel(risk.id)" [icon]="commentIcon" (pressed)="comment.emit({ item: risk.id })" />
            </li>
          }
        </ul>
      }
    }
  `,
})
export class ReviewItems {
  readonly review = input.required<ReviewView>();
  readonly section = input.required<"criteria" | "files" | "tasks" | "risks">();
  readonly comment = output<CommentAnchor>();

  private readonly preferences = inject(Preferences);
  protected readonly t = this.preferences.t;
  protected readonly lang = this.preferences.lang;
  protected readonly actions = ACTIONS;
  protected readonly status = STATUS;
  protected readonly warningIcon = LucideTriangleAlert;
  protected readonly sensitiveIcon = LucideShieldAlert;
  protected readonly commentIcon = LucideMessageSquarePlus;
  protected readonly reveal = REVEAL;

  protected actionLabel(file: FileView): string {
    return this.t()(ACTIONS[file.action].es, ACTIONS[file.action].en);
  }

  protected statusLabel(task: TaskItemView): string {
    return this.t()(STATUS[task.status].es, STATUS[task.status].en);
  }

  protected commentLabel(id: string): string {
    return this.t()(`Comentar ${id}`, `Comment on ${id}`);
  }
}

/** The comment button of an item shows with the pointer over the item or focus inside it. */
const REVEAL = "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100";
