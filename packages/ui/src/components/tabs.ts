// SPDX-License-Identifier: Apache-2.0
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChildren,
  ElementRef,
  forwardRef,
  inject,
  input,
  model,
} from "@angular/core";

let nextId = 0;

/**
 * One panel of `sp-tabs`: its `value` identifies it and `label` names its tab. Only the selected
 * panel is shown; the others are hidden from everyone.
 */
@Component({
  selector: "sp-tab-panel",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: "tabpanel",
    tabindex: "0",
    "[id]": "tabs.panelId(value())",
    "[attr.aria-labelledby]": "tabs.tabId(value())",
    "[hidden]": "tabs.current() !== value()",
  },
  template: `<ng-content />`,
})
export class TabPanel {
  readonly value = input.required<string>();
  readonly label = input.required<string>();
  protected readonly tabs: Tabs = inject(forwardRef(() => Tabs));
}

/**
 * Tabs (WAI-ARIA tabs pattern, automatic activation): arrows move between tabs, Home and End
 * go to the ends, and only the selected tab is in the tab order. `[(selected)]` binds the value.
 */
@Component({
  selector: "sp-tabs",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "flex flex-col gap-4" },
  template: `
    <div role="tablist" class="flex gap-1 border-b border-border" [attr.aria-label]="label() || null">
      @for (panel of panels(); track panel.value()) {
        <button
          type="button"
          role="tab"
          class="-mb-px cursor-pointer rounded-t-lg border border-transparent border-b-2 px-3 py-2 font-sans text-sm text-text-muted hover:text-text aria-selected:border-b-accent aria-selected:font-medium aria-selected:text-text"
          [id]="tabId(panel.value())"
          [attr.aria-selected]="current() === panel.value()"
          [attr.aria-controls]="panelId(panel.value())"
          [tabIndex]="current() === panel.value() ? 0 : -1"
          (click)="select(panel.value())"
          (keydown)="onKeydown($event, $index)"
        >
          {{ panel.label() }}
        </button>
      }
    </div>
    <ng-content />
  `,
})
export class Tabs {
  /** Accessible name of the tab list, when the page gives it no visible heading. */
  readonly label = input("");
  readonly selected = model<string>();

  protected readonly panels = contentChildren(TabPanel);
  private readonly base = `sp-tabs-${nextId++}`;
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;

  /** The selected value, or the first panel when nothing valid is selected. */
  readonly current = computed(() => {
    const values = this.panels().map((panel) => panel.value());
    const chosen = this.selected();
    return chosen !== undefined && values.includes(chosen) ? chosen : values[0];
  });

  tabId(value: string): string {
    return `${this.base}-tab-${value}`;
  }

  panelId(value: string): string {
    return `${this.base}-panel-${value}`;
  }

  protected select(value: string): void {
    this.selected.set(value);
  }

  protected onKeydown(event: KeyboardEvent, index: number): void {
    const count = this.panels().length;
    const target = {
      ArrowRight: (index + 1) % count,
      ArrowLeft: (index - 1 + count) % count,
      Home: 0,
      End: count - 1,
    }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    const value = this.panels()[target]?.value();
    if (value === undefined) return;
    this.select(value);
    this.host.querySelector<HTMLElement>(`#${CSS.escape(this.tabId(value))}`)?.focus();
  }
}
