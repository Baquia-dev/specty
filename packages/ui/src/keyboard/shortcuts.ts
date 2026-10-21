// SPDX-License-Identifier: Apache-2.0
import { DOCUMENT } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  Injectable,
  inject,
  signal,
} from "@angular/core";
import type { Lang } from "@baquia-dev/specty-core";
import { DialogFrame, Dialogs } from "../components/dialog";
import { Kbd } from "../components/kbd";
import { Preferences } from "../theme/preferences";

export interface Shortcut {
  /** `mod+k`, `?`, `j`, `escape`…; `mod` is ⌘ on macOS and Ctrl elsewhere. */
  readonly keys: string;
  readonly description: Readonly<Record<Lang, string>>;
  readonly run: (event: KeyboardEvent) => void;
}

/** Shortcuts that also work while typing in a field. */
const WHILE_TYPING: ReadonlySet<string> = new Set(["mod+k", "escape"]);
const NAMES: Readonly<Record<string, string>> = { esc: "escape", return: "enter" };

/** `keys` in one canonical form, so `Mod+K` and `mod+k` are the same shortcut. */
export function normalizeKeys(keys: string): string {
  const parts = keys
    .toLowerCase()
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  const key = parts.at(-1) ?? "";
  const modifiers = ["mod", "alt", "shift"].filter((modifier) => parts.includes(modifier));
  return [...modifiers, NAMES[key] ?? key].join("+");
}

/** The shortcut a key press means. A printed symbol already carries its Shift (`?`); a letter does not. */
export function keysOf(event: KeyboardEvent, mac: boolean): string {
  const key = event.key.toLowerCase();
  const printed = event.key.length === 1 && !/^[a-z]$/i.test(event.key);
  const modifiers = [
    (mac ? event.metaKey : event.ctrlKey) ? "mod" : "",
    event.altKey ? "alt" : "",
    event.shiftKey && !printed ? "shift" : "",
  ].filter(Boolean);
  return [...modifiers, NAMES[key] ?? key].join("+");
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * The single owner of keyboard shortcuts. A shortcut lives as long as whoever registered it;
 * the latest registration of the same keys wins. `?` lists the active ones.
 */
@Injectable({ providedIn: "root" })
export class Shortcuts {
  private readonly entries = signal<readonly Shortcut[]>([]);
  private readonly dialogs = inject(Dialogs);
  private readonly mac = /mac|iphone|ipad/i.test(
    inject(DOCUMENT).defaultView?.navigator.platform ?? "",
  );

  /** Active shortcuts, one per keys (the latest), for the help dialog. */
  readonly active = computed(() => {
    const byKeys = new Map(this.entries().map((entry) => [normalizeKeys(entry.keys), entry]));
    return [...byKeys.values()];
  });

  constructor() {
    const document = inject(DOCUMENT);
    const listener = (event: KeyboardEvent) => this.handle(event);
    document.addEventListener("keydown", listener);
    inject(DestroyRef).onDestroy(() => document.removeEventListener("keydown", listener));
    this.add({
      keys: "?",
      description: { es: "Ver los atajos de teclado", en: "See keyboard shortcuts" },
      run: () => this.dialogs.open(ShortcutsHelp),
    });
  }

  /** Call it in an injection context, or pass the `DestroyRef` that ends the shortcut. */
  register(shortcut: Shortcut, destroyRef: DestroyRef = inject(DestroyRef)): void {
    this.add(shortcut);
    destroyRef.onDestroy(() =>
      this.entries.update((all) => all.filter((entry) => entry !== shortcut)),
    );
  }

  private add(shortcut: Shortcut): void {
    this.entries.update((all) => [...all, shortcut]);
  }

  private handle(event: KeyboardEvent): void {
    const pressed = keysOf(event, this.mac);
    if (isTyping(event.target) && !WHILE_TYPING.has(pressed)) return;
    const match = this.entries().findLast((entry) => normalizeKeys(entry.keys) === pressed);
    if (match === undefined) return;
    event.preventDefault();
    match.run(event);
  }
}

/** The list of active shortcuts, opened with `?`. */
@Component({
  selector: "sp-shortcuts-help",
  imports: [DialogFrame, Kbd],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sp-dialog [heading]="t()('Atajos de teclado', 'Keyboard shortcuts')">
      <dl class="m-0 grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-2">
        @for (shortcut of shortcuts.active(); track shortcut.keys) {
          <dt class="text-sm">{{ shortcut.description[lang()] }}</dt>
          <dd class="m-0 justify-self-end"><sp-kbd [keys]="shortcut.keys" /></dd>
        }
      </dl>
    </sp-dialog>
  `,
})
export class ShortcutsHelp {
  protected readonly shortcuts = inject(Shortcuts);
  private readonly preferences = inject(Preferences);
  protected readonly t = this.preferences.t;
  protected readonly lang = this.preferences.lang;
}
