// SPDX-License-Identifier: Apache-2.0
import { Combobox, ComboboxPopup, ComboboxWidget } from "@angular/aria/combobox";
import { Listbox, Option } from "@angular/aria/listbox";
import { CdkConnectedOverlay, CdkOverlayOrigin } from "@angular/cdk/overlay";
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  effect,
  input,
  model,
  signal,
  viewChild,
} from "@angular/core";
import { LucideDynamicIcon } from "@lucide/angular";
import { LucideCheck, LucideChevronDown } from "./icons";
import { MENU_POSITIONS } from "./menu";
import { followOrigin } from "./overlay-follow";

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

let nextId = 0;

/** Like the other fields: 36 px, border and surface; its chevron turns while the list is open. */
const TRIGGER =
  "inline-flex h-9 min-w-0 cursor-pointer items-center justify-between gap-2 rounded-lg border border-border bg-surface pr-2 pl-3 font-sans text-[13px] text-text transition-colors hover:bg-bg";
const CHEVRON =
  "shrink-0 text-text-muted transition-transform duration-150 motion-reduce:transition-none";

/**
 * As the menu's items: the active one lights up and the chosen one carries a mark. In the chat the
 * list's ground is already the page's, so they light up with a tint of the text.
 */
const OPTION =
  "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] whitespace-nowrap text-text hover:bg-bg data-[active=true]:bg-bg aria-selected:font-medium embedded:hover:bg-text/6 embedded:data-[active=true]:bg-text/6";

/**
 * A select drawn in the style of the UI, not the system's dropdown. Angular Aria gives it the
 * keyboard of a native select (a combobox over a listbox): Enter, Space, ↓ or Alt+↓ open it;
 * arrows, Home/End and typing move; Enter or a click choose; Escape or leaving close it. The
 * focus stays on the trigger throughout, and the list floats in a CDK overlay kept on screen.
 */
@Component({
  selector: "sp-select",
  imports: [
    Combobox,
    ComboboxPopup,
    ComboboxWidget,
    Listbox,
    Option,
    CdkConnectedOverlay,
    CdkOverlayOrigin,
    LucideDynamicIcon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "inline-flex min-w-0 items-center gap-2" },
  template: `
    @if (!hideLabel()) {
      <span class="text-[13px] whitespace-nowrap text-text-muted" [id]="labelId">{{ label() }}</span>
    }
    <div
      ngCombobox
      #combobox="ngCombobox"
      cdkOverlayOrigin
      #origin="cdkOverlayOrigin"
      #field
      [class]="trigger"
      [(expanded)]="expanded"
      [attr.aria-labelledby]="hideLabel() ? null : labelId"
      [attr.aria-label]="hideLabel() ? label() : null"
      (keydown.alt.arrowdown)="expanded.set(true)"
      data-select
    >
      <span class="truncate">{{ current()?.label }}</span>
      <svg [class]="expanded() ? chevron + ' rotate-180' : chevron" [lucideIcon]="chevronIcon" size="14" aria-hidden="true"></svg>
    </div>
    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="origin"
      [cdkConnectedOverlayOpen]="true"
      [cdkConnectedOverlayPositions]="positions"
      [cdkConnectedOverlayViewportMargin]="8"
    >
      <ng-template ngComboboxPopup [combobox]="combobox">
        <!--
          Pressing an option keeps the focus on the trigger, so the list is not closed under the click.
          In the chat the surface is translucent, so the list takes the chat's opaque ground instead.
        -->
        <div
          ngComboboxWidget
          ngListbox
          #listbox="ngListbox"
          class="flex max-h-72 flex-col gap-0.5 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-md embedded:bg-bg"
          selectionMode="explicit"
          focusMode="activedescendant"
          [hidden]="!expanded()"
          [style.min-width.px]="width()"
          [activeDescendant]="listbox.activeDescendant()"
          [value]="[value()]"
          (valueChange)="choose($event)"
          (mousedown)="$event.preventDefault()"
        >
          @for (option of options(); track option.value) {
            <div ngOption [class]="option_" [value]="option.value" [label]="option.label">
              <svg [class]="option.value === value() ? 'shrink-0' : 'invisible shrink-0'" [lucideIcon]="checkIcon" size="14" aria-hidden="true"></svg>
              {{ option.label }}
            </div>
          }
        </div>
      </ng-template>
    </ng-template>
  `,
})
export class Select {
  /** Its name: shown before it, or only to assistive technology with `hideLabel`. */
  readonly label = input.required<string>();
  readonly hideLabel = input(false);
  readonly options = input.required<readonly SelectOption[]>();
  readonly value = model.required<string>();

  protected readonly labelId = `sp-select-${nextId++}`;
  protected readonly trigger = TRIGGER;
  protected readonly chevron = CHEVRON;
  protected readonly option_ = OPTION;
  protected readonly chevronIcon = LucideChevronDown;
  protected readonly checkIcon = LucideCheck;
  protected readonly positions = [...MENU_POSITIONS];
  protected readonly expanded = signal(false);
  /** The list is at least as wide as the trigger. */
  protected readonly width = signal(0);
  protected readonly current = computed(() =>
    this.options().find((option) => option.value === this.value()),
  );
  private readonly field = viewChild.required("field", { read: ElementRef<HTMLElement> });
  private readonly overlay = viewChild.required(CdkConnectedOverlay);

  constructor() {
    effect(() => {
      if (this.expanded()) this.width.set(this.field().nativeElement.offsetWidth);
    });
    // The list renders on the first opening; placed again then, it opens above when needed.
    followOrigin(
      () => this.expanded(),
      () => this.overlay(),
    );
  }

  /** Choosing closes the list; choosing the chosen one again keeps it. */
  protected choose(values: readonly string[]): void {
    const next = values[0];
    if (next !== undefined) this.value.set(next);
    this.expanded.set(false);
  }
}
