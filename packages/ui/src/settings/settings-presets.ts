// SPDX-License-Identifier: Apache-2.0
import { NgTemplateOutlet } from "@angular/common";
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from "@angular/core";
import {
  PRESETS,
  type Preset,
  presetEdits,
  presetOf,
  presetText,
  type SettingValue,
} from "@baquia-dev/specty-core/light";
import type { ConfigRecord } from "../data/source";
import { Preferences } from "../theme/preferences";
import type { Draft } from "./settings-edit";
import { valueAt } from "./settings-view";

/** A profile, or Propio, as its card shows it. */
interface Choice {
  readonly id: Preset | "custom";
  readonly name: string;
  readonly description: string;
  /** It matches the configuration with the page's edits. */
  readonly chosen: boolean;
  /** The person chooses it here: a profile, where the page is not read only. */
  readonly button: boolean;
}

const CARD =
  "flex h-full w-full min-w-0 flex-col gap-1.5 rounded-xl border p-4 text-left font-sans text-text";
/** The chosen card on the surface, with a ring; the rest on the page's background. */
const CARD_CHOSEN = `${CARD} border-text/40 bg-surface outline-1 -outline-offset-2 outline-text/40`;
const CARD_PLAIN = `${CARD} border-border bg-bg`;
const BUTTON = "cursor-pointer outline-offset-2 hover:bg-surface";
const PILL = "inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-medium";

/**
 * The profiles of the view Flujo in Básico, above the line: Ligero, Equilibrado, Estricto and
 * Propio, each with what it fixes; Equilibrado with «Por defecto», and the one the configuration
 * matches, with the page's edits, with «Elegido» (Propio when none does). Where the person can
 * decide, each profile is a button whose edits go to the page like a piece's; Propio is not chosen.
 */
@Component({
  selector: "sp-settings-presets",
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block", "data-presets": "" },
  template: `
    <ul class="m-0 grid list-none grid-cols-1 gap-2.5 p-0 sm:grid-cols-2 lg:grid-cols-4" [attr.aria-label]="t()('Perfiles', 'Profiles')">
      @for (choice of choices(); track choice.id) {
        <li class="flex min-w-0" [attr.data-preset]="choice.id">
          @if (choice.button) {
            <button type="button" [class]="(choice.chosen ? chosen : plain) + ' ' + button" [attr.aria-pressed]="choice.chosen" (click)="choose(choice.id)">
              <ng-container *ngTemplateOutlet="body; context: { $implicit: choice }" />
            </button>
          } @else {
            <div [class]="choice.chosen ? chosen : plain">
              <ng-container *ngTemplateOutlet="body; context: { $implicit: choice }" />
            </div>
          }
        </li>
      }
    </ul>
    <ng-template #body let-item>
      @let choice = asChoice(item);
      <span class="flex flex-wrap items-center justify-between gap-2">
        <span class="text-sm font-semibold" data-preset-name>{{ choice.name }}</span>
        <span class="flex flex-wrap gap-1">
          @if (choice.id === 'balanced') {
            <span [class]="pill + ' bg-text/8 text-text'" data-mark="default">{{ t()('Por defecto', 'Default') }}</span>
          }
          @if (choice.chosen) {
            <span [class]="pill" style="color: var(--color-phase-implementing); background: var(--color-phase-implementing-bg)" data-mark="chosen">{{ t()('Elegido', 'Chosen') }}</span>
          }
        </span>
      </span>
      <span class="text-[12.5px] leading-[18px] text-text-muted" data-preset-description>{{ choice.description }}</span>
    </ng-template>
  `,
})
export class SettingsPresets {
  /** The configuration the server gives. */
  readonly record = input.required<ConfigRecord>();
  /** Each setting's value with the page's edits, or else its default. */
  readonly value = input.required<SettingValue>();
  /** Whether the person can change the settings here. */
  readonly editable = input(false);
  /** An edit of choosing a profile, for the page's edits. */
  readonly edit = output<Draft>();

  private readonly preferences = inject(Preferences);
  protected readonly t = this.preferences.t;
  protected readonly chosen = CARD_CHOSEN;
  protected readonly plain = CARD_PLAIN;
  protected readonly button = BUTTON;
  protected readonly pill = PILL;

  /** Each setting's default, as the server gives it. */
  private readonly fallback = computed((): SettingValue => {
    const defaults = this.record().defaults;
    return (key) => valueAt(defaults, key);
  });

  protected readonly choices = computed((): readonly Choice[] => {
    const fallback = this.fallback();
    const lang = this.preferences.lang();
    const matched = presetOf(this.value(), fallback);
    const editable = this.editable();
    return [...PRESETS, "custom" as const].map(
      (id): Choice => ({
        id,
        ...presetText(id, fallback, lang),
        chosen: id === matched,
        button: editable && id !== "custom",
      }),
    );
  });

  /** The card's choice, typed again for its template. */
  protected asChoice(choice: Choice): Choice {
    return choice;
  }

  /** Chooses the profile: its edits, one per key, replace the page's earlier ones of its keys. */
  protected choose(id: Preset | "custom"): void {
    if (id === "custom") return;
    const input = this.record().input;
    for (const edit of presetEdits(id, (key) => valueAt(input, key), this.fallback())) {
      this.edit.emit({ edit });
    }
  }
}
