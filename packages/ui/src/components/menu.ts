// SPDX-License-Identifier: Apache-2.0
import { Menu as AriaMenu, MenuContent, MenuItem, MenuTrigger } from "@angular/aria/menu";
import {
  CdkConnectedOverlay,
  CdkOverlayOrigin,
  type ConnectedPosition,
} from "@angular/cdk/overlay";
import { ChangeDetectionStrategy, Component, input, output, viewChild } from "@angular/core";
import { LucideDynamicIcon, type LucideIconInput } from "@lucide/angular";
import { followOrigin } from "./overlay-follow";

export interface MenuEntry {
  readonly id: string;
  readonly label: string;
  readonly icon?: LucideIconInput;
}

/** Below the button first; above when it does not fit. */
export const MENU_POSITIONS: readonly ConnectedPosition[] = [
  { originX: "start", originY: "bottom", overlayX: "start", overlayY: "top", offsetY: 4 },
  { originX: "end", originY: "bottom", overlayX: "end", overlayY: "top", offsetY: 4 },
  { originX: "start", originY: "top", overlayX: "start", overlayY: "bottom", offsetY: -4 },
  { originX: "end", originY: "top", overlayX: "end", overlayY: "bottom", offsetY: -4 },
];

/**
 * A menu button on Angular Aria: the keyboard (arrows, typeahead, Escape) comes from Aria, and
 * the list floats in a CDK overlay that stays on screen. Choosing an item emits its id.
 */
@Component({
  selector: "sp-menu",
  imports: [
    MenuTrigger,
    AriaMenu,
    MenuItem,
    MenuContent,
    CdkConnectedOverlay,
    CdkOverlayOrigin,
    LucideDynamicIcon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "inline-flex" },
  template: `
    <button
      type="button"
      ngMenuTrigger
      cdkOverlayOrigin
      #origin="cdkOverlayOrigin"
      #trigger="ngMenuTrigger"
      class="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-3 font-sans text-base font-medium text-text hover:bg-bg"
      [menu]="list()"
    >
      @if (icon(); as icon) {
        <svg [lucideIcon]="icon" size="16" aria-hidden="true"></svg>
      }
      {{ label() }}
    </button>
    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="origin"
      [cdkConnectedOverlayOpen]="true"
      [cdkConnectedOverlayPositions]="positions"
      [cdkConnectedOverlayViewportMargin]="8"
    >
      <div
        ngMenu
        #list="ngMenu"
        class="flex min-w-48 flex-col gap-0.5 rounded-xl border border-border bg-surface p-1 shadow-md"
        [hidden]="!list.visible()"
        (itemSelected)="choose($event)"
      >
        <ng-template ngMenuContent>
          @for (item of items(); track item.id) {
            <div
              ngMenuItem
              class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-text outline-none hover:bg-bg data-[active=true]:bg-bg"
              [value]="item.id"
              [searchTerm]="item.label"
            >
              @if (item.icon; as icon) {
                <svg [lucideIcon]="icon" size="14" aria-hidden="true"></svg>
              }
              {{ item.label }}
            </div>
          }
        </ng-template>
      </div>
    </ng-template>
  `,
})
export class Menu {
  readonly label = input.required<string>();
  readonly icon = input<LucideIconInput>();
  readonly items = input.required<readonly MenuEntry[]>();
  readonly selected = output<string>();

  protected readonly positions = [...MENU_POSITIONS];
  protected readonly list = viewChild<AriaMenu<string>>("list");
  private readonly overlay = viewChild(CdkConnectedOverlay);

  constructor() {
    // Next to its button even after the page scrolls, and above it when it does not fit below.
    followOrigin(
      () => this.list()?.visible() ?? false,
      () => this.overlay(),
    );
  }

  protected choose(value: string | undefined): void {
    if (value !== undefined) this.selected.emit(value);
  }
}
