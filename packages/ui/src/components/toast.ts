// SPDX-License-Identifier: Apache-2.0
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  Injectable,
  inject,
  input,
  signal,
} from "@angular/core";
import {
  LucideCircleCheck,
  LucideCircleX,
  LucideDynamicIcon,
  LucideInfo,
  LucideTriangleAlert,
  LucideX,
} from "@lucide/angular";
import { Preferences } from "../theme/preferences";
import { IconButton } from "./button";

export type ToastKind = "info" | "success" | "warning" | "error";

export interface ToastItem {
  readonly id: number;
  readonly kind: ToastKind;
  readonly text: string;
}

/** How long a toast stays on its own; errors stay until closed. */
export const TOAST_MS = 5000;
export const MAX_TOASTS = 3;

/** Toasts of the whole UI. Errors are announced at once; the rest, politely. */
@Injectable({ providedIn: "root" })
export class Toasts {
  readonly items = signal<readonly ToastItem[]>([]);
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();
  private nextId = 0;

  show(text: string, kind: ToastKind = "info"): number {
    const id = this.nextId++;
    const all = [...this.items(), { id, kind, text }];
    for (const old of all.slice(0, -MAX_TOASTS)) this.stop(old.id);
    this.items.set(all.slice(-MAX_TOASTS));
    this.resume(id);
    return id;
  }

  dismiss(id: number): void {
    this.stop(id);
    this.items.update((items) => items.filter((item) => item.id !== id));
  }

  /** While the pointer or the focus is on a toast, it does not leave. */
  pause(id: number): void {
    this.stop(id);
  }

  resume(id: number): void {
    const item = this.items().find((toast) => toast.id === id);
    if (item === undefined || item.kind === "error") return;
    this.stop(id);
    this.timers.set(
      id,
      setTimeout(() => this.dismiss(id), TOAST_MS),
    );
  }

  private stop(id: number): void {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
  }
}

const ICONS = {
  info: LucideInfo,
  success: LucideCircleCheck,
  warning: LucideTriangleAlert,
  error: LucideCircleX,
} as const;

const TONES: Readonly<Record<ToastKind, string>> = {
  info: "var(--color-text-muted)",
  success: "var(--color-phase-done)",
  warning: "var(--color-phase-review)",
  error: "var(--color-phase-cancelled)",
};

/** One toast: icon and text by kind (never color alone), and its close button. */
@Component({
  selector: "sp-toast",
  imports: [LucideDynamicIcon, IconButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      "pointer-events-auto flex items-start gap-2 rounded-xl border border-border bg-surface p-3 text-sm text-text shadow-md transition-[opacity,translate] starting:translate-y-2 starting:opacity-0",
    style: "transition-duration: var(--duration-base)",
    "[attr.data-kind]": "toast().kind",
    "(pointerenter)": "toasts.pause(toast().id)",
    "(pointerleave)": "toasts.resume(toast().id)",
    "(focusin)": "toasts.pause(toast().id)",
    "(focusout)": "toasts.resume(toast().id)",
  },
  template: `
    <svg
      class="mt-0.5 shrink-0"
      size="16"
      aria-hidden="true"
      [lucideIcon]="icons[toast().kind]"
      [style.color]="tones[toast().kind]"
    ></svg>
    <p class="m-0 flex-1"><span class="sr-only">{{ kindLabel() }}: </span>{{ toast().text }}</p>
    <sp-icon-button
      size="sm"
      [label]="t()('Cerrar aviso', 'Close notice')"
      [icon]="close"
      (pressed)="toasts.dismiss(toast().id)"
    />
  `,
})
export class Toast {
  readonly toast = input.required<ToastItem>();

  protected readonly toasts = inject(Toasts);
  protected readonly t = inject(Preferences).t;
  protected readonly icons = ICONS;
  protected readonly tones = TONES;
  protected readonly close = LucideX;
  protected readonly kindLabel = computed(() => {
    const t = this.t();
    return {
      info: t("Información", "Information"),
      success: t("Hecho", "Done"),
      warning: t("Aviso", "Warning"),
      error: t("Error", "Error"),
    }[this.toast().kind];
  });
}

/** Where toasts appear (bottom right). Place it once, at the root of the app. */
@Component({
  selector: "sp-toaster",
  imports: [Toast],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      "pointer-events-none fixed right-4 bottom-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2",
  },
  template: `
    <div class="flex flex-col gap-2" aria-live="polite">
      @for (toast of calm(); track toast.id) {
        <sp-toast [toast]="toast" />
      }
    </div>
    <div class="flex flex-col gap-2" aria-live="assertive">
      @for (toast of urgent(); track toast.id) {
        <sp-toast [toast]="toast" />
      }
    </div>
  `,
})
export class Toaster {
  private readonly toasts = inject(Toasts);
  protected readonly calm = computed(() =>
    this.toasts.items().filter((toast) => toast.kind !== "error"),
  );
  protected readonly urgent = computed(() =>
    this.toasts.items().filter((toast) => toast.kind === "error"),
  );
}
