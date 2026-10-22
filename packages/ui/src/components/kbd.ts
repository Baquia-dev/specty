// SPDX-License-Identifier: Apache-2.0
import { DOCUMENT } from "@angular/common";
import { ChangeDetectionStrategy, Component, computed, inject, input } from "@angular/core";
import type { Lang } from "@baquia-dev/specty-core";
import { Preferences } from "../theme/preferences";

interface Key {
  readonly shown: string;
  readonly spoken: string;
}

type Names = Readonly<Record<Lang, string>>;

/** Keys with a symbol and a spoken name; `mod` is ⌘ on macOS and Ctrl elsewhere. */
const KEYS: Readonly<Record<string, (mac: boolean) => { shown: string; spoken: Names }>> = {
  mod: (mac) =>
    mac
      ? { shown: "⌘", spoken: { es: "Comando", en: "Command" } }
      : { shown: "Ctrl", spoken: { es: "Control", en: "Control" } },
  shift: () => ({ shown: "⇧", spoken: { es: "Mayúsculas", en: "Shift" } }),
  alt: (mac) =>
    mac
      ? { shown: "⌥", spoken: { es: "Opción", en: "Option" } }
      : { shown: "Alt", spoken: { es: "Alt", en: "Alt" } },
  enter: () => ({ shown: "↵", spoken: { es: "Intro", en: "Enter" } }),
  esc: () => ({ shown: "Esc", spoken: { es: "Escape", en: "Escape" } }),
  backspace: () => ({ shown: "⌫", spoken: { es: "Retroceso", en: "Backspace" } }),
};

/** A keyboard shortcut: one `<kbd>` per key, read aloud as a whole (`keys="mod+k"`). */
@Component({
  selector: "sp-kbd",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "inline-flex items-center gap-1 align-middle" },
  template: `
    @for (key of keys(); track $index) {
      <kbd
        aria-hidden="true"
        class="inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-border bg-bg px-1 font-mono text-xs text-text-muted"
        >{{ key.shown }}</kbd
      >
    }
    <span class="sr-only">{{ spoken() }}</span>
  `,
})
export class Kbd {
  readonly shortcut = input.required<string>({ alias: "keys" });

  private readonly lang = inject(Preferences).lang;
  private readonly mac = isMac(inject(DOCUMENT).defaultView?.navigator);

  protected readonly keys = computed<readonly Key[]>(() =>
    this.shortcut()
      .split("+")
      .map((key) => key.trim().toLowerCase())
      .filter((key) => key.length > 0)
      .map((key) => {
        const known = KEYS[key]?.(this.mac);
        if (known !== undefined) return { shown: known.shown, spoken: known.spoken[this.lang()] };
        return { shown: key.toUpperCase(), spoken: key.toUpperCase() };
      }),
  );
  protected readonly spoken = computed(() =>
    this.keys()
      .map((key) => key.spoken)
      .join(" "),
  );
}

function isMac(navigator: Navigator | undefined): boolean {
  if (navigator === undefined) return false;
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform;
  return /mac|iphone|ipad/i.test(platform);
}
