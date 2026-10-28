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
import { LucideDynamicIcon } from "@lucide/angular";
import { filter } from "rxjs";
import { Button, IconButton } from "../components/button";
import { Commands } from "../components/command-palette";
import { LucideSearch } from "../components/icons";
import { Kbd } from "../components/kbd";
import { Toaster } from "../components/toast";
import { ChangesStore } from "../data/changes-store";
import { Shortcuts } from "../keyboard/shortcuts";
import { Preferences } from "../theme/preferences";
import { DelegationChip } from "./delegation";
import { PreferencesMenu } from "./preferences-menu";
import { DEV_TOOLS } from "./routes";

/** The frame of every screen: header (Inbox, the catalog in development, ⌘K, preferences) and toasts. */
@Component({
  selector: "sp-root",
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    LucideDynamicIcon,
    Button,
    IconButton,
    Kbd,
    Toaster,
    DelegationChip,
    PreferencesMenu,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- The window never scrolls: only the content below the header does. -->
    <div class="flex h-dvh flex-col overflow-hidden bg-bg text-text">
      <!-- One line at any width: the search shrinks to an icon on a phone; theme and language live in a menu. -->
      <header class="flex shrink-0 flex-nowrap items-center gap-x-2.5 border-b border-border px-6 py-3 sm:gap-x-6">
        <a routerLink="/" class="font-mono text-md font-semibold no-underline">specty</a>
        <nav class="flex gap-1" [attr.aria-label]="t()('Principal', 'Main')">
          @for (link of links; track link.path) {
            <a
              class="flex h-8 items-center rounded-lg px-2 text-sm whitespace-nowrap text-text-muted no-underline aria-[current=page]:bg-surface aria-[current=page]:text-text aria-[current=page]:shadow-sm sm:px-3"
              [routerLink]="link.path"
              routerLinkActive
              ariaCurrentWhenActive="page"
              [routerLinkActiveOptions]="{ exact: link.exact }"
              >{{ t()(link.es, link.en) }}</a
            >
          }
        </nav>
        <div class="ml-auto flex items-center gap-2">
          <span class="flex sm:hidden">
            <sp-icon-button size="sm" variant="secondary" [icon]="search" [label]="t()('Buscar o ejecutar', 'Search or run')" (pressed)="commands.openPalette()" />
          </span>
          <span class="hidden sm:flex">
            <sp-button size="sm" (pressed)="commands.openPalette()">
              <svg [lucideIcon]="search" size="14" aria-hidden="true"></svg>
              <span class="text-text-muted">{{ t()('Buscar o ejecutar…', 'Search or run…') }}</span>
              <sp-kbd keys="mod+k" />
            </sp-button>
          </span>
          <sp-delegation-chip />
          <sp-preferences-menu />
        </div>
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
  protected readonly search = LucideSearch;
  /** The catalog is for whoever develops the UI: only in development (`DEV_TOOLS`). */
  private readonly devTools = inject(DEV_TOOLS);
  protected readonly links = [
    { path: "/", es: "Bandeja", en: "Inbox", exact: true },
    ...(this.devTools ? [{ path: "/catalog", es: "Catálogo", en: "Catalog", exact: false }] : []),
  ];

  private readonly content = viewChild.required<ElementRef<HTMLElement>>("content");
  /** Navigations inside the app: going back only leaves the app when there is none. */
  private navigations = 0;

  constructor() {
    const router = inject(Router);
    const location = inject(Location);
    const store = inject(ChangesStore);
    const destroyRef = inject(DestroyRef);
    this.followNavigation(router, destroyRef);
    this.goBackWithBackspace(router, location, destroyRef);
    this.registerCommands(router, store, destroyRef);
  }

  /** A new page starts at the top, with focus on the content so the keys scroll it. */
  private followNavigation(router: Router, destroyRef: DestroyRef): void {
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
  }

  /** Backspace goes back, or to the Inbox when the app has no page to go back to. */
  private goBackWithBackspace(router: Router, location: Location, destroyRef: DestroyRef): void {
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
  }

  /** The palette's commands: the pages, the theme, the language and one "Open" per change. */
  private registerCommands(router: Router, store: ChangesStore, destroyRef: DestroyRef): void {
    const add = (id: string, es: string, en: string, run: () => void) =>
      this.commands.register({ id, label: { es, en }, run }, destroyRef);
    add("go:inbox", "Ir a la Bandeja", "Go to the Inbox", () => void router.navigateByUrl("/"));
    if (this.devTools) {
      add(
        "go:catalog",
        "Ir al catálogo",
        "Go to the catalog",
        () => void router.navigateByUrl("/catalog"),
      );
    }
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
}
