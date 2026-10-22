// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core";
import { Router, RouterLink, RouterLinkActive, RouterOutlet, type Routes } from "@angular/router";
import {
  LucideComponent,
  LucideDynamicIcon,
  LucideLayers,
  LucideLayoutGrid,
  LucideLayoutList,
  LucidePalette,
  LucideType,
} from "@lucide/angular";
import { Commands } from "../components/command-palette";
import { PAGE } from "../components/document";
import { Preferences } from "../theme/preferences";

/** Pages of the catalog, under `/catalog`; each loads on demand. */
export const CATALOG_ROUTES: Routes = [
  { path: "", pathMatch: "full", redirectTo: "colors" },
  {
    path: "colors",
    loadComponent: () => import("./colors").then((page) => page.Colors),
    title: "Specty · Colores",
  },
  {
    path: "typography",
    loadComponent: () => import("./foundations").then((page) => page.Typography),
    title: "Specty · Tipografía",
  },
  {
    path: "foundations",
    loadComponent: () => import("./foundations").then((page) => page.Foundations),
    title: "Specty · Fundamentos",
  },
  {
    path: "components",
    loadComponent: () => import("./components").then((page) => page.Components),
    title: "Specty · Componentes",
  },
  {
    path: "overlays",
    loadComponent: () => import("./overlays").then((page) => page.Overlays),
    title: "Specty · Superposiciones y teclado",
  },
  {
    path: "patterns",
    loadComponent: () => import("./patterns").then((page) => page.Patterns),
    title: "Specty · Patrones",
  },
  { path: "**", redirectTo: "colors" },
];

/** The design system catalog: a section of the app with its own navigation. */
@Component({
  selector: "sp-catalog",
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- The common page width; the menu stays in view beside the page, or on a phone above it. -->
    <div [class]="page + ' flex flex-col gap-6 pt-6 md:flex-row md:gap-10 md:pt-10'">
      <nav class="md:w-60 md:shrink-0" [attr.aria-label]="t()('Catálogo', 'Catalog')">
        <!-- On a phone, one line that scrolls sideways, like the Inbox phases. -->
        <ul class="-mx-6 my-0 flex list-none gap-1 overflow-x-auto px-6 py-0 scrollbar-none md:sticky md:top-10 md:mx-0 md:flex-col md:overflow-visible md:px-0">
          @for (page of pages(); track page.path) {
            <li class="shrink-0">
              <a
                class="flex h-9 items-center gap-3 rounded-lg px-3 whitespace-nowrap text-text-muted no-underline aria-[current=page]:bg-surface aria-[current=page]:text-text aria-[current=page]:shadow-sm"
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
      <div class="min-w-0 flex-1">
        <router-outlet />
      </div>
    </div>
  `,
})
export class Catalog {
  protected readonly t = inject(Preferences).t;
  protected readonly page = PAGE;
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
      {
        path: "/catalog/overlays",
        icon: LucideLayers,
        label: t("Superposiciones y teclado", "Overlays and keyboard"),
      },
      { path: "/catalog/patterns", icon: LucideLayoutList, label: t("Patrones", "Patterns") },
    ];
  });

  constructor() {
    const commands = inject(Commands);
    const router = inject(Router);
    for (const page of [
      ["colors", "Colores", "Colors"],
      ["typography", "Tipografía", "Typography"],
      ["foundations", "Fundamentos", "Foundations"],
      ["components", "Componentes", "Components"],
      ["overlays", "Superposiciones y teclado", "Overlays and keyboard"],
      ["patterns", "Patrones", "Patterns"],
    ] as const) {
      const [path, es, en] = page;
      commands.register({
        id: `go:catalog/${path}`,
        label: { es: `Catálogo: ${es}`, en: `Catalog: ${en}` },
        run: () => void router.navigateByUrl(`/catalog/${path}`),
      });
    }
  }
}
