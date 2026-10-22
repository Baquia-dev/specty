// SPDX-License-Identifier: Apache-2.0
import { DOCUMENT, Location } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type ElementRef,
  effect,
  inject,
  viewChild,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import { LANGS } from "@baquia-dev/specty-core";
import {
  LucideDynamicIcon,
  LucideMonitor,
  LucideMoon,
  LucideSearch,
  LucideSun,
} from "@lucide/angular";
import { filter } from "rxjs";
import { Button } from "../components/button";
import { Commands } from "../components/command-palette";
import { Kbd } from "../components/kbd";
import { Toaster } from "../components/toast";
import { ChangesStore } from "../data/changes-store";
import { Shortcuts } from "../keyboard/shortcuts";
import { Preferences, THEME_CHOICES, type ThemeChoice } from "../theme/preferences";

const THEME_ICONS = { light: LucideSun, dark: LucideMoon, system: LucideMonitor } as const;

const CHOICE =
  "flex h-8 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm has-checked:bg-surface has-checked:shadow-sm has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-focus";

/** The frame of every screen: header (Inbox, catalog, ⌘K, theme and language) and toasts. */
@Component({
  selector: "sp-root",
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LucideDynamicIcon, Button, Kbd, Toaster],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- The window never scrolls: only the content below the header does. -->
    <div class="flex h-dvh flex-col overflow-hidden bg-bg text-text">
      <header class="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-3 border-b border-border px-6 py-3">
        <a routerLink="/" class="font-mono text-md font-semibold no-underline">specty</a>
        <nav class="flex gap-1" [attr.aria-label]="t()('Principal', 'Main')">
          @for (link of links; track link.path) {
            <a
              class="flex h-8 items-center rounded-lg px-3 text-sm text-text-muted no-underline aria-[current=page]:bg-surface aria-[current=page]:text-text aria-[current=page]:shadow-sm"
              [routerLink]="link.path"
              routerLinkActive
              ariaCurrentWhenActive="page"
              [routerLinkActiveOptions]="{ exact: link.exact }"
              >{{ t()(link.es, link.en) }}</a
            >
          }
        </nav>
        <sp-button class="ml-auto" size="sm" (pressed)="commands.openPalette()">
          <svg [lucideIcon]="search" size="14" aria-hidden="true"></svg>
          <span class="text-text-muted">{{ t()('Buscar o ejecutar…', 'Search or run…') }}</span>
          <sp-kbd keys="mod+k" />
        </sp-button>
        <fieldset class="m-0 flex gap-1 border-0 p-0">
          <legend class="sr-only">{{ t()('Tema', 'Theme') }}</legend>
          @for (choice of themes; track choice) {
            <label [class]="choice_">
              <input
                class="sr-only"
                type="radio"
                name="theme"
                [value]="choice"
                [checked]="preferences.theme() === choice"
                (change)="preferences.theme.set(choice)"
              />
              <svg [lucideIcon]="themeIcons[choice]" size="14" aria-hidden="true"></svg>
              <span class="sr-only">{{ themeLabel(choice) }}</span>
            </label>
          }
        </fieldset>
        <fieldset class="m-0 flex gap-1 border-0 p-0">
          <legend class="sr-only">{{ t()('Idioma', 'Language') }}</legend>
          @for (lang of langs; track lang) {
            <label [class]="choice_ + ' font-mono uppercase'">
              <input
                class="sr-only"
                type="radio"
                name="lang"
                [value]="lang"
                [checked]="preferences.lang() === lang"
                (change)="preferences.lang.set(lang)"
              />
              {{ lang }}
            </label>
          }
        </fieldset>
      </header>
      <!--
        Only this area scrolls. Positioned, so absolute content (screen-reader text) cannot escape
        it and scroll the whole page; every page ends with the same room below.
      -->
      <main #content tabindex="-1" class="relative min-h-0 flex-1 overflow-y-auto pb-16 focus:outline-none">
        <router-outlet />
      </main>
      <sp-toaster />
    </div>
  `,
})
export class Shell {
  protected readonly preferences = inject(Preferences);
  protected readonly commands = inject(Commands);
  private readonly document = inject(DOCUMENT);
  protected readonly t = this.preferences.t;
  protected readonly themes = THEME_CHOICES;
  protected readonly themeIcons = THEME_ICONS;
  protected readonly langs = LANGS;
  protected readonly search = LucideSearch;
  protected readonly choice_ = CHOICE;
  protected readonly links = [
    { path: "/", es: "Bandeja", en: "Inbox", exact: true },
    { path: "/catalog", es: "Catálogo", en: "Catalog", exact: false },
  ];

  private readonly content = viewChild.required<ElementRef<HTMLElement>>("content");
  /** Navigations inside the app: going back only leaves the app when there is none. */
  private navigations = 0;

  constructor() {
    const router = inject(Router);
    const location = inject(Location);
    const store = inject(ChangesStore);
    const destroyRef = inject(DestroyRef);

    // A new page starts at the top, with focus on the content so the keys scroll it.
    router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(destroyRef),
      )
      .subscribe(() => {
        this.navigations++;
        if (this.navigations === 1) return;
        const content = this.content().nativeElement;
        content.scrollTop = 0;
        content.focus({ preventScroll: true });
      });
    inject(Shortcuts).register(
      {
        keys: "backspace",
        description: { es: "Volver a la página anterior", en: "Go back" },
        run: () => {
          if (this.document.querySelector("[role=dialog][aria-modal=true]") !== null) return;
          if (this.navigations > 1) location.back();
          else void router.navigateByUrl("/");
        },
      },
      destroyRef,
    );
    const add = (id: string, es: string, en: string, run: () => void) =>
      this.commands.register({ id, label: { es, en }, run }, destroyRef);
    add("go:inbox", "Ir a la Bandeja", "Go to the Inbox", () => void router.navigateByUrl("/"));
    add(
      "go:catalog",
      "Ir al catálogo",
      "Go to the catalog",
      () => void router.navigateByUrl("/catalog"),
    );
    add("theme:light", "Tema claro", "Light theme", () => this.preferences.theme.set("light"));
    add("theme:dark", "Tema oscuro", "Dark theme", () => this.preferences.theme.set("dark"));
    add("theme:system", "Tema del sistema", "System theme", () =>
      this.preferences.theme.set("system"),
    );
    add("lang:es", "Idioma: español", "Language: Spanish", () => this.preferences.lang.set("es"));
    add("lang:en", "Idioma: inglés", "Language: English", () => this.preferences.lang.set("en"));

    // One "Open" command per change, as changes appear.
    const opened = new Set<string>();
    effect(() => {
      for (const change of store.all()) {
        if (opened.has(change.id)) continue;
        opened.add(change.id);
        add(
          `open:${change.id}`,
          `Abrir: ${change.title}`,
          `Open: ${change.title}`,
          () => void router.navigate(["/changes", change.id]),
        );
      }
    });
  }

  protected themeLabel(choice: ThemeChoice): string {
    const t = this.t();
    if (choice === "light") return t("Tema claro", "Light theme");
    if (choice === "dark") return t("Tema oscuro", "Dark theme");
    return t("Tema del sistema", "System theme");
  }
}
