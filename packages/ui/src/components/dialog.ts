// SPDX-License-Identifier: Apache-2.0
import { Dialog, DialogRef } from "@angular/cdk/dialog";
import type { ComponentType } from "@angular/cdk/portal";
import {
  ChangeDetectionStrategy,
  Component,
  Injectable,
  InjectionToken,
  inject,
  input,
} from "@angular/core";
import { Preferences } from "../theme/preferences";
import { IconButton } from "./button";
import { LucideX } from "./icons";

let nextId = 0;

/** Id of the open dialog's title, so the dialog is announced by it (`aria-labelledby`). */
export const DIALOG_TITLE_ID = new InjectionToken<string>("DIALOG_TITLE_ID");

/**
 * Opens dialogs on the CDK: focus moves in and stays there, the page behind is dimmed and
 * inert, Escape closes, and focus returns to whatever opened the dialog.
 */
@Injectable({ providedIn: "root" })
export class Dialogs {
  private readonly dialog = inject(Dialog);

  open<R = unknown, D = unknown, C = unknown>(component: ComponentType<C>, data?: D) {
    const titleId = `sp-dialog-title-${nextId++}`;
    return this.dialog.open<R, D, C>(component, {
      ...(data === undefined ? {} : { data }),
      ariaModal: true,
      ariaLabelledBy: titleId,
      autoFocus: "first-tabbable",
      restoreFocus: true,
      backdropClass: "bg-[rgb(0_0_0/0.4)]",
      panelClass: "sp-dialog-pane",
      providers: [{ provide: DIALOG_TITLE_ID, useValue: titleId }],
    });
  }
}

/** The frame of every dialog: title, optional description, content and actions (`[actions]`). */
@Component({
  selector: "sp-dialog",
  imports: [IconButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      "flex w-[min(32rem,calc(100vw-2rem))] flex-col gap-4 rounded-xl border border-border bg-surface p-5 text-text shadow-md transition-[opacity,scale] starting:scale-95 starting:opacity-0",
    style: "transition-duration: var(--duration-base)",
  },
  template: `
    <header class="flex items-start justify-between gap-4">
      <div class="flex flex-col gap-1">
        <h2 class="m-0 text-lg font-semibold" [id]="titleId">{{ heading() }}</h2>
        @if (description()) {
          <p class="m-0 text-sm text-text-muted">{{ description() }}</p>
        }
      </div>
      <sp-icon-button size="sm" [label]="t()('Cerrar', 'Close')" [icon]="closeIcon" (pressed)="close()" />
    </header>
    <ng-content />
    <footer class="flex flex-wrap justify-end gap-2 empty:hidden">
      <ng-content select="[actions]" />
    </footer>
  `,
})
export class DialogFrame {
  readonly heading = input.required<string>();
  readonly description = input("");

  protected readonly t = inject(Preferences).t;
  protected readonly titleId =
    inject(DIALOG_TITLE_ID, { optional: true }) ?? `sp-dialog-title-${nextId++}`;
  protected readonly closeIcon = LucideX;
  private readonly ref = inject(DialogRef, { optional: true });

  close(): void {
    this.ref?.close();
  }
}
