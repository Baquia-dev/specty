// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core";
import { RouterLink, RouterLinkActive, RouterOutlet, type Routes } from "@angular/router";
import { LANGS } from "@baquia-dev/specty-core";
import {
  LucideComponent,
  LucideDynamicIcon,
  LucideLayoutGrid,
  LucideMonitor,
  LucideMoon,
  LucidePalette,
  LucideSun,
  LucideType,
} from "@lucide/angular";
import { Preferences, THEME_CHOICES, type ThemeChoice } from "../theme/preferences";
import { Colors } from "./colors";
import { Components } from "./components";
import { Foundations, Typography } from "./foundations";

export const CATALOG_ROUTES: Routes = [
  { path: "", pathMatch: "full", redirectTo: "catalog/colors" },
  { path: "catalog/colors", component: Colors, title: "Specty · Colores" },
  { path: "catalog/typography", component: Typography, title: "Specty · Tipografía" },
  { path: "catalog/foundations", component: Foundations, title: "Specty · Fundamentos" },
  { path: "catalog/components", component: Components, title: "Specty · Componentes" },
  { path: "**", redirectTo: "catalog/colors" },
];

const THEME_ICONS = { light: LucideSun, dark: LucideMoon, system: LucideMonitor } as const;

@Component({
  selector: "sp-root",
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-bg text-text">
      <header class="flex flex-wrap items-center justify-between gap-4 border-b border-border px-6 py-4">
        <p class="m-0 flex items-baseline gap-3">
          <span class="font-mono text-md font-semibold">specty</span>
          <span class="text-sm text-text-muted">{{ t()('Sistema de diseño', 'Design system') }}</span>
        </p>
        <div class="flex flex-wrap items-center gap-4">
          <fieldset class="m-0 flex gap-1 border-0 p-0">
            <legend class="sr-only">{{ t()('Tema', 'Theme') }}</legend>
            @for (choice of themes; track choice) {
              <label
                class="flex h-8 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm has-checked:bg-surface has-checked:shadow-sm has-focus-visible:outline-2 has-focus-visible:outline-focus"
              >
                <input
                  class="sr-only"
                  type="radio"
                  name="theme"
                  [value]="choice"
                  [checked]="preferences.theme() === choice"
                  (change)="preferences.theme.set(choice)"
                />
                <svg [lucideIcon]="themeIcons[choice]" size="14" aria-hidden="true"></svg>
                {{ themeLabel(choice) }}
              </label>
            }
          </fieldset>
          <fieldset class="m-0 flex gap-1 border-0 p-0">
            <legend class="sr-only">{{ t()('Idioma', 'Language') }}</legend>
            @for (lang of langs; track lang) {
              <label
                class="flex h-8 cursor-pointer items-center rounded-lg px-3 font-mono text-sm uppercase has-checked:bg-surface has-checked:shadow-sm has-focus-visible:outline-2 has-focus-visible:outline-focus"
              >
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
        </div>
      </header>
      <div class="flex flex-wrap">
        <nav class="flex-[1_1_200px] px-4 py-6" [attr.aria-label]="t()('Catálogo', 'Catalog')">
          <ul class="m-0 flex list-none flex-col gap-1 p-0">
            @for (page of pages(); track page.path) {
              <li>
                <a
                  class="flex h-9 items-center gap-3 rounded-lg px-3 text-text-muted no-underline aria-[current=page]:bg-surface aria-[current=page]:text-text aria-[current=page]:shadow-sm"
                  [routerLink]="page.path"
                  routerLinkActive
                  ariaCurrentWhenActive="page"
                >
                  <svg [lucideIcon]="page.icon" size="16" aria-hidden="true"></svg>
                  {{ page.label }}
                </a>
              </li>
            }
          </ul>
        </nav>
        <main class="min-w-0 flex-[999_1_560px] px-6 py-6">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class Catalog {
  protected readonly preferences = inject(Preferences);
  protected readonly t = this.preferences.t;
  protected readonly themes = THEME_CHOICES;
  protected readonly themeIcons = THEME_ICONS;
  protected readonly langs = LANGS;
  protected readonly pages = computed(() => {
    const t = this.t();
    return [
      { path: "/catalog/colors", icon: LucidePalette, label: t("Colores", "Colors") },
      { path: "/catalog/typography", icon: LucideType, label: t("Tipografía", "Typography") },
      {
        path: "/catalog/foundations",
        icon: LucideLayoutGrid,
        label: t("Fundamentos", "Foundations"),
      },
      { path: "/catalog/components", icon: LucideComponent, label: t("Componentes", "Components") },
    ];
  });

  protected themeLabel(choice: ThemeChoice): string {
    const t = this.t();
    if (choice === "light") return t("Claro", "Light");
    if (choice === "dark") return t("Oscuro", "Dark");
    return t("Sistema", "System");
  }
}
