// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, computed, input, output } from "@angular/core";
import { LucideDynamicIcon, type LucideIconInput } from "@lucide/angular";
import { Tooltip } from "./tooltip";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md";

const BASE =
  "relative inline-flex cursor-pointer items-center justify-center overflow-hidden rounded-lg border font-sans font-medium transition-colors disabled:pointer-events-none disabled:opacity-50";

const RELEASE = ["pointerup", "pointerleave", "pointercancel"] as const;

/** Duration of a motion token in ms (0 with reduced motion); `fallback` if CSS is not loaded. */
function duration(element: Element, token: string, fallback: number): number {
  const value = element.ownerDocument.defaultView
    ?.getComputedStyle(element)
    .getPropertyValue(token)
    .trim();
  const parsed = Number.parseFloat(value ?? "");
  return Number.isNaN(parsed) ? fallback : parsed;
}

/**
 * A ripple from where the pointer pressed: it grows while the button is held and fades when
 * released. A disabled button gets no pointer events, so it never ripples.
 */
function ripple(event: PointerEvent): void {
  const button = event.currentTarget;
  if (!(button instanceof HTMLElement)) return;
  const view = button.ownerDocument.defaultView;
  if (view?.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const box = button.getBoundingClientRect();
  const x = event.clientX - box.left;
  const y = event.clientY - box.top;
  const radius = Math.hypot(Math.max(x, box.width - x), Math.max(y, box.height - y));
  const wave = button.ownerDocument.createElement("span");
  wave.dataset.ripple = "";
  wave.setAttribute("aria-hidden", "true");
  wave.className = "pointer-events-none absolute rounded-full bg-current opacity-20";
  Object.assign(wave.style, {
    left: `${x - radius}px`,
    top: `${y - radius}px`,
    width: `${radius * 2}px`,
    height: `${radius * 2}px`,
  });
  button.append(wave);
  wave.animate?.([{ transform: "scale(0)" }, { transform: "scale(1)" }], {
    duration: duration(button, "--duration-base", 200),
    easing: "cubic-bezier(0.2, 0, 0, 1)",
    fill: "forwards",
  });
  const release = () => {
    for (const type of RELEASE) button.removeEventListener(type, release);
    const fade = wave.animate?.([{ opacity: 0.2 }, { opacity: 0 }], {
      duration: duration(button, "--duration-fast", 120),
      fill: "forwards",
    });
    if (fade === undefined) wave.remove();
    else fade.onfinish = () => wave.remove();
  };
  for (const type of RELEASE) button.addEventListener(type, release);
}

const VARIANTS: Readonly<Record<ButtonVariant, string>> = {
  primary: "border-transparent bg-accent text-on-accent hover:opacity-90",
  secondary: "border-border bg-surface text-text hover:bg-bg",
  ghost: "border-transparent bg-transparent text-text hover:bg-surface",
};

const SIZES: Readonly<Record<ButtonSize, string>> = {
  sm: "h-8 gap-1.5 px-3 text-sm",
  md: "h-9 gap-2 px-4 text-base",
};

const ICON_SIZES: Readonly<Record<ButtonSize, string>> = { sm: "size-8", md: "size-9" };

/**
 * A native `<button>`. It is never disabled without a reason: with `disabledReason` it gets
 * `disabled` and `aria-disabled`, and the reason appears in a tooltip and as its description.
 * Its action is `pressed`, emitted only by the native button, never while disabled.
 */
@Component({
  selector: "sp-button",
  imports: [Tooltip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "inline-flex", "[class.cursor-not-allowed]": "disabled()" },
  template: `
    <sp-tooltip [text]="disabledReason()">
      <button
        [type]="type()"
        [class]="classes()"
        [disabled]="disabled()"
        [attr.aria-disabled]="disabled() || null"
        (click)="pressed.emit($event)"
        (pointerdown)="ripple($event)"
      >
        <ng-content />
      </button>
    </sp-tooltip>
  `,
})
export class Button {
  readonly variant = input<ButtonVariant>("secondary");
  readonly size = input<ButtonSize>("md");
  readonly type = input<"button" | "submit">("button");
  readonly disabledReason = input("");
  readonly pressed = output<MouseEvent>();

  protected readonly disabled = computed(() => this.disabledReason().length > 0);
  protected readonly ripple = ripple;
  protected readonly classes = computed(
    () => `${BASE} ${VARIANTS[this.variant()]} ${SIZES[this.size()]}`,
  );
}

/** A button with only an icon: its label is required, as its name and as its tooltip. */
@Component({
  selector: "sp-icon-button",
  imports: [Tooltip, LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "inline-flex", "[class.cursor-not-allowed]": "disabled()" },
  template: `
    <sp-tooltip [text]="disabledReason() || label()" [describe]="disabled()">
      <button
        type="button"
        [class]="classes()"
        [attr.aria-label]="label()"
        [disabled]="disabled()"
        [attr.aria-disabled]="disabled() || null"
        (click)="pressed.emit($event)"
        (pointerdown)="ripple($event)"
      >
        <svg [lucideIcon]="icon()" [size]="size() === 'sm' ? 14 : 16" aria-hidden="true"></svg>
      </button>
    </sp-tooltip>
  `,
})
export class IconButton {
  readonly label = input.required<string>();
  readonly icon = input.required<LucideIconInput>();
  readonly variant = input<ButtonVariant>("ghost");
  readonly size = input<ButtonSize>("md");
  readonly disabledReason = input("");
  readonly pressed = output<MouseEvent>();

  protected readonly disabled = computed(() => this.disabledReason().length > 0);
  protected readonly ripple = ripple;
  protected readonly classes = computed(
    () => `${BASE} ${VARIANTS[this.variant()]} ${ICON_SIZES[this.size()]}`,
  );
}
