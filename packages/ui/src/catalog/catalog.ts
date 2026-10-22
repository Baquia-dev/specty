// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core";
import { Router, RouterLink, RouterLinkActive, RouterOutlet, type Routes } from "@angular/router";
import {
  LucideComponent,
  LucideDynamicIcon,
  LucideLayers,
  LucideLayoutGrid,
  LucidePalette,
  LucideType,
} from "@lucide/angular";
import { Commands } from "../components/command-palette";
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
  { path: "**", redirectTo: "colors" },
];

/** The design system catalog: a section of the app with its own navigation. */
@Component({
  selector: "sp-catalog",
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap">
      <nav class="flex-[1_1_200px] px-4 pt-6" [attr.aria-label]="t()('Catálogo', 'Catalog')">
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
      <div class="min-w-0 flex-[999_1_560px] px-6 pt-6">
        <router-outlet />
      </div>
    </div>
  `,
})
export class Catalog {
  protected readonly t = inject(Preferences).t;
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
