// SPDX-License-Identifier: Apache-2.0
import { DOCUMENT } from "@angular/common";
import { computed, effect, Injectable, inject, signal } from "@angular/core";
import { LANGS, type Lang, translator } from "@baquia-dev/specty-core/light";

export type ThemeChoice = "light" | "dark" | "system";
export type Theme = "light" | "dark";

export const THEME_CHOICES: readonly ThemeChoice[] = ["light", "dark", "system"];

const KEYS = { theme: "specty.theme", lang: "specty.lang" } as const;
const DARK_QUERY = "(prefers-color-scheme: dark)";

/** Theme and language of the UI: signals applied to `<html>` and remembered in this browser. */
@Injectable({ providedIn: "root" })
export class Preferences {
  private readonly document = inject(DOCUMENT);
  private readonly window = this.document.defaultView;
  private readonly systemDark = signal(this.window?.matchMedia?.(DARK_QUERY).matches ?? false);

  readonly theme = signal<ThemeChoice>(this.stored(KEYS.theme, THEME_CHOICES) ?? "system");
  readonly lang = signal<Lang>(this.stored(KEYS.lang, LANGS) ?? this.browserLang());
  readonly resolvedTheme = computed<Theme>(() => {
    const choice = this.theme();
    if (choice !== "system") return choice;
    return this.systemDark() ? "dark" : "light";
  });
  readonly t = computed(() => translator(this.lang()));

  constructor() {
    this.window
      ?.matchMedia?.(DARK_QUERY)
      .addEventListener("change", (event) => this.systemDark.set(event.matches));
    effect(() => {
      const root = this.document.documentElement;
      root.dataset.theme = this.resolvedTheme();
      root.lang = this.lang();
    });
    effect(() => this.store(KEYS.theme, this.theme()));
    effect(() => this.store(KEYS.lang, this.lang()));
  }

  private browserLang(): Lang {
    return this.window?.navigator.language.toLowerCase().startsWith("es") ? "es" : "en";
  }

  /** Storage can be missing or throw (private mode, blocked site data): fall back to defaults. */
  private stored<T extends string>(key: string, allowed: readonly T[]): T | undefined {
    try {
      const value = this.window?.localStorage.getItem(key);
      return allowed.find((item) => item === value);
    } catch {
      return undefined;
    }
  }

  private store(key: string, value: string): void {
    try {
      this.window?.localStorage.setItem(key, value);
    } catch {
      // Not remembered across visits; the current choice still applies.
    }
  }
}
