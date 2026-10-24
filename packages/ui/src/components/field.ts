// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, computed, input, model } from "@angular/core";
import { LucideDynamicIcon } from "@lucide/angular";
import { LucideCircleAlert } from "./icons";

let nextId = 0;

const CONTROL =
  "w-full rounded-lg border border-border bg-surface px-3 font-sans text-base text-text placeholder:text-text-muted aria-invalid:border-phase-cancelled";

/**
 * A labelled text control: a native `<input>` or `<textarea>`, with its hint and error already
 * linked (`aria-describedby`, `aria-invalid`). The value binds both ways: `[(value)]`.
 */
@Component({
  selector: "sp-field",
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "flex flex-col gap-1.5" },
  template: `
    <label class="text-sm font-medium" [for]="id">{{ label() }}</label>
    @if (multiline()) {
      <textarea
        rows="4"
        [class]="control + ' py-2'"
        [id]="id"
        [placeholder]="placeholder()"
        [value]="value()"
        [attr.aria-describedby]="describedBy()"
        [attr.aria-invalid]="error() ? true : null"
        (input)="onInput($event)"
      ></textarea>
    } @else {
      <input
        type="text"
        [class]="control + ' h-9'"
        [id]="id"
        [placeholder]="placeholder()"
        [value]="value()"
        [attr.aria-describedby]="describedBy()"
        [attr.aria-invalid]="error() ? true : null"
        (input)="onInput($event)"
      />
    }
    @if (hint()) {
      <p class="m-0 text-xs text-text-muted" [id]="id + '-hint'">{{ hint() }}</p>
    }
    @if (error()) {
      <p class="m-0 flex items-center gap-1 text-xs text-phase-cancelled" [id]="id + '-error'">
        <svg [lucideIcon]="alert" size="13" aria-hidden="true"></svg>
        {{ error() }}
      </p>
    }
  `,
})
export class Field {
  readonly label = input.required<string>();
  readonly hint = input("");
  readonly error = input("");
  readonly placeholder = input("");
  readonly multiline = input(false);
  readonly value = model("");

  protected readonly id = `sp-field-${nextId++}`;
  protected readonly control = CONTROL;
  protected readonly alert = LucideCircleAlert;
  protected readonly describedBy = computed(
    () =>
      [this.hint() ? `${this.id}-hint` : "", this.error() ? `${this.id}-error` : ""]
        .filter(Boolean)
        .join(" ") || null,
  );

  protected onInput(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      this.value.set(target.value);
    }
  }
}
