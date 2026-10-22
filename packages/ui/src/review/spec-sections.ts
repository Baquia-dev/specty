// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, inject, input, output } from "@angular/core";
import {
  LucideArrowRight,
  LucideCircleCheck,
  LucideCircleDashed,
  LucideDynamicIcon,
  LucideMessageSquarePlus,
  LucidePencil,
  LucidePlus,
  LucideShieldAlert,
  LucideTrash2,
  LucideTriangleAlert,
} from "@lucide/angular";
import { Badge } from "../components/badge";
import { IconButton } from "../components/button";
import type { Toasts } from "../components/toast";
import {
  ActionError,
  type CommentAnchor,
  type FileView,
  type ReviewView,
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

/** A document row: its id in a fixed column, the content, and its actions on the right. */
export const ROW =
  "group grid grid-cols-[2.75rem_minmax(0,1fr)_auto] gap-x-3 border-b border-border py-3.5";

/** The comment button of an item shows with the pointer over the item or focus inside it. */
export const REVEAL = "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100";

/** The rows of a section start under a hairline, like the rows between them. */
export const LIST = "m-0 list-none border-t border-border p-0";

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

/** Criteria, files by module, tasks and risks as document rows: each item can be commented on. */
@Component({
  selector: "sp-review-items",
  imports: [LucideDynamicIcon, Badge, IconButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (section()) {
      @case ('criteria') {
        <ol [class]="list">
          @for (criterion of review().criteria; track criterion.id) {
            <li [class]="row" [attr.data-item]="criterion.id">
              <span class="pt-0.5 font-mono text-xs text-text-muted">{{ criterion.id }}</span>
              <div class="flex min-w-0 flex-col gap-1">
                <p class="m-0">{{ criterion.text }}</p>
                @for (warning of criterion.warnings; track $index) {
                  <p class="m-0 flex items-start gap-2 text-sm" style="color: var(--color-phase-review)" role="note">
                    <svg class="mt-1 shrink-0" [lucideIcon]="warningIcon" size="14" aria-hidden="true"></svg>{{ warning[lang()] }}
                  </p>
                }
              </div>
              <sp-icon-button [class]="reveal" size="sm" [label]="commentLabel(criterion.id)" [icon]="commentIcon" (pressed)="comment.emit({ item: criterion.id })" />
            </li>
          }
        </ol>
      }
      @case ('files') {
        @for (group of review().files; track group.module) {
          <h3 class="mt-0 mb-2 font-mono text-xs font-medium text-text-muted">{{ group.module }}/</h3>
          <ul [class]="list + ' mb-5'">
            @for (file of group.files; track file.path) {
              <li class="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 border-b border-border py-2 text-sm">
                <span class="flex items-center gap-1 text-xs text-text-muted" [attr.data-action]="file.action">
                  <svg [lucideIcon]="actions[file.action].icon" size="13" aria-hidden="true"></svg>{{ actionLabel(file) }}
                </span>
                <span class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <code class="font-mono text-[13px]">{{ file.from ? file.from + ' → ' : '' }}{{ file.path }}</code>
                  @if (file.sensitive) {
                    <span class="flex items-center gap-1 text-xs font-medium" style="color: var(--color-phase-review)" data-sensitive>
                      <svg [lucideIcon]="sensitiveIcon" size="13" aria-hidden="true"></svg>{{ t()('Ruta sensible', 'Sensitive path') }}
                    </span>
                  }
                  @if (file.reason) {
                    <span class="text-text-muted">— {{ file.reason }}</span>
                  }
                </span>
              </li>
            }
          </ul>
        }
      }
      @case ('tasks') {
        <ol [class]="list">
          @for (task of review().tasks; track task.id) {
            <li [class]="row" [attr.data-item]="task.id">
              <span class="pt-0.5 font-mono text-xs text-text-muted">{{ task.id }}</span>
              <div class="flex min-w-0 flex-col gap-1.5">
                <p class="m-0 font-medium">{{ task.title }}</p>
                <div class="flex flex-wrap gap-1">
                  @for (criterion of task.ac; track criterion) {
                    <sp-badge>{{ criterion }}</sp-badge>
                  }
                  @for (path of task.files; track path) {
                    <code class="rounded-sm border border-border px-1 font-mono text-xs">{{ path }}</code>
                  }
                </div>
                @for (warning of task.warnings; track $index) {
                  <p class="m-0 flex items-start gap-2 text-sm" style="color: var(--color-phase-review)" role="note">
                    <svg class="mt-1 shrink-0" [lucideIcon]="warningIcon" size="14" aria-hidden="true"></svg>{{ warning[lang()] }}
                  </p>
                }
              </div>
              <div class="flex items-start gap-1">
                <span class="flex h-6 items-center gap-1 text-xs whitespace-nowrap text-text-muted" data-status>
                  <svg [lucideIcon]="status[task.status].icon" size="13" aria-hidden="true"></svg>{{ statusLabel(task) }}
                </span>
                <sp-icon-button [class]="reveal" size="sm" [label]="commentLabel(task.id)" [icon]="commentIcon" (pressed)="comment.emit({ item: task.id })" />
              </div>
            </li>
          }
        </ol>
      }
      @case ('risks') {
        <ul [class]="list">
          @for (risk of review().risks; track risk.id) {
            <li [class]="row" [attr.data-item]="risk.id">
              <span class="pt-0.5 font-mono text-xs text-text-muted">{{ risk.id }}</span>
              <p class="m-0">{{ risk.text }}</p>
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
  protected readonly row = ROW;
  protected readonly list = LIST;
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
