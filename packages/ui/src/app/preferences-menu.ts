// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { LANGS, type Lang } from "@baquia-dev/specty-core";
import { LucideDynamicIcon, type LucideIconInput } from "@lucide/angular";
import { LucideMonitor, LucideMoon, LucideSlidersHorizontal, LucideSun } from "../components/icons";
import { Tooltip } from "../components/tooltip";
import { Preferences, THEME_CHOICES, type ThemeChoice } from "../theme/preferences";
import { DelegationSetting } from "./delegation";

const THEMES: Readonly<
  Record<ThemeChoice, { readonly icon: LucideIconInput; readonly es: string; readonly en: string }>
> = {
  light: { icon: LucideSun, es: "Claro", en: "Light" },
  dark: { icon: LucideMoon, es: "Oscuro", en: "Dark" },
  system: { icon: LucideMonitor, es: "Sistema", en: "System" },
};

/** Each language by its own name, whatever the interface language. */
const LANG_NAMES: Readonly<Record<Lang, string>> = { es: "Español", en: "English" };

const TRIGGER =
  "relative inline-flex size-8 cursor-pointer items-center justify-center rounded-lg border border-transparent font-sans text-text transition-colors hover:bg-surface";
const TRIGGER_OPEN = `${TRIGGER} bg-surface shadow-sm`;

/** A choice in a segmented group: the checked one reads as raised. */
const CHOICE =
  "flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 text-[13px] text-text-muted has-checked:bg-surface has-checked:font-semibold has-checked:text-text has-checked:shadow-sm has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-focus";

const LEGEND = "mb-2 p-0 text-xs font-medium tracking-widest text-text-muted uppercase";

/**
 * Theme and language behind one button, so the header fits on one line. A native popover: it
 * closes on Escape or a click outside, and choosing applies at once without closing it. It sits
 * fixed under the header, which never scrolls.
 */
@Component({
  selector: "sp-preferences-menu",
  imports: [LucideDynamicIcon, Tooltip, DelegationSetting],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "inline-flex" },
  template: `
    <sp-tooltip [text]="open() ? '' : label()" [describe]="false">
      <button type="button" [class]="open() ? triggerOpen : trigger" popovertarget="sp-preferences" [attr.aria-label]="label()">
        <svg [lucideIcon]="icon" size="16" aria-hidden="true"></svg>
      </button>
    </sp-tooltip>
    <!-- No display utility on the popover itself: the browser hides it while closed. -->
    <div id="sp-preferences" popover class="inset-auto top-15 right-6 m-0 w-72 rounded-xl border border-border bg-surface p-3 text-text shadow-md" [attr.aria-label]="label()" (toggle)="toggled($event)">
      <div class="flex flex-col gap-4">
        <fieldset class="m-0 border-0 p-0">
          <legend [class]="legend">{{ t()('Tema', 'Theme') }}</legend>
          <div class="flex gap-1 rounded-lg bg-text/5 p-1">
            @for (choice of themes; track choice) {
              <label [class]="choice_">
                <input class="sr-only" type="radio" name="theme" [value]="choice" [checked]="preferences.theme() === choice" (change)="preferences.theme.set(choice)" />
                <svg [lucideIcon]="themeLabels[choice].icon" size="14" aria-hidden="true"></svg>
                {{ t()(themeLabels[choice].es, themeLabels[choice].en) }}
              </label>
            }
          </div>
        </fieldset>
        <fieldset class="m-0 border-0 p-0">
          <legend [class]="legend">{{ t()('Idioma', 'Language') }}</legend>
          <div class="flex gap-1 rounded-lg bg-text/5 p-1">
            @for (lang of langs; track lang) {
              <label [class]="choice_" [attr.lang]="lang">
                <input class="sr-only" type="radio" name="lang" [value]="lang" [checked]="preferences.lang() === lang" (change)="preferences.lang.set(lang)" />
                {{ langNames[lang] }}
              </label>
            }
          </div>
        </fieldset>
        <sp-delegation-setting [legendClass]="legend" />
      </div>
    </div>
  `,
})
export class PreferencesMenu {
  protected readonly preferences = inject(Preferences);
  protected readonly t = this.preferences.t;
  protected readonly icon = LucideSlidersHorizontal;
  protected readonly themes = THEME_CHOICES;
  protected readonly themeLabels = THEMES;
  protected readonly langs = LANGS;
  protected readonly langNames = LANG_NAMES;
  protected readonly trigger = TRIGGER;
  protected readonly triggerOpen = TRIGGER_OPEN;
  protected readonly choice_ = CHOICE;
  protected readonly legend = LEGEND;
  protected readonly label = computed(() => this.t()("Preferencias", "Preferences"));
  /** The panel is showing: its button stays raised. */
  protected readonly open = signal(false);

  /** A `ToggleEvent`, read by its field: not every environment defines the class. */
  protected toggled(event: Event): void {
    this.open.set("newState" in event && event.newState === "open");
  }
}
