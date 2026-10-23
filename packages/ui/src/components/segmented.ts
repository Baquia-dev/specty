// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, input, model } from "@angular/core";

export interface SegmentedOption {
  readonly value: string;
  readonly label: string;
}

let nextId = 0;

/** As tall as the fields (36 px with its border); the options wrap to a new line when they must. */
const GROUP =
  "inline-flex max-w-full flex-wrap gap-0.5 rounded-[0.5625rem] border border-border bg-surface p-0.5";

/**
 * An option: 32 px (40 px on touch screens); the chosen one on a faint ground. Its radio is out of
 * sight, so the option itself draws the focus, inward like everywhere else.
 */
const OPTION =
  "relative inline-flex min-h-8 cursor-pointer items-center rounded-[0.4375rem] px-2.5 font-sans text-[13px] text-text-muted transition-colors duration-(--duration-fast) select-none hover:text-text has-checked:bg-text/8 has-checked:font-semibold has-checked:text-text has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-(--color-focus) pointer-coarse:min-h-10";

/**
 * One choice among a few, all in sight («Unificado | Lado a lado»). Native radios dressed as
 * segments: Tab goes into the chosen one, the arrows move and choose, and a screen reader hears the
 * group by its name. For many options, or long ones, the select fits better.
 */
@Component({
  selector: "sp-segmented",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "inline-flex min-w-0 max-w-full flex-wrap items-center gap-2" },
  template: `
    @if (!hideLabel()) {
      <span class="text-[13px] whitespace-nowrap text-text-muted" [id]="labelId">{{ label() }}</span>
    }
    <div
      role="radiogroup"
      [class]="group"
      [attr.aria-labelledby]="hideLabel() ? null : labelId"
      [attr.aria-label]="hideLabel() ? label() : null"
      data-segmented
    >
      @for (option of options(); track option.value) {
        <label [class]="option_" [attr.data-value]="option.value">
          <input type="radio" class="sr-only" [name]="name" [value]="option.value" [checked]="option.value === value()" (change)="value.set(option.value)" />
          {{ option.label }}
        </label>
      }
    </div>
  `,
})
export class Segmented {
  /** Its name: shown before it, or only to assistive technology with `hideLabel`. */
  readonly label = input.required<string>();
  readonly hideLabel = input(false);
  readonly options = input.required<readonly SegmentedOption[]>();
  readonly value = model.required<string>();

  private readonly id = nextId++;
  protected readonly labelId = `sp-segmented-${this.id}`;
  /** One group of radios per instance, so two selectors never share their choice. */
  protected readonly name = `sp-segmented-${this.id}-option`;
  protected readonly group = GROUP;
  protected readonly option_ = OPTION;
}
