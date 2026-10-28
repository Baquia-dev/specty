// SPDX-License-Identifier: Apache-2.0
import { InjectionToken, isDevMode } from "@angular/core";
import type { Routes } from "@angular/router";

/**
 * The tools for whoever develops the UI, such as the design system's catalog: only in
 * development (`ng serve`), never in the build that `specty ui` serves to people.
 */
export const DEV_TOOLS = new InjectionToken<boolean>("dev tools", { factory: () => isDevMode() });

/** Every screen loads on demand: the first load carries only the shell. */
export function appRoutes(devTools: boolean): Routes {
  return [
    {
      path: "",
      pathMatch: "full",
      loadComponent: () => import("../inbox/inbox").then((page) => page.Inbox),
      title: "Specty · Bandeja",
    },
    {
      path: "changes/:id",
      loadComponent: () => import("../change/change-page").then((page) => page.ChangePage),
      title: "Specty · Cambio",
    },
    ...(devTools
      ? [
          {
            path: "catalog",
            loadComponent: () => import("../catalog/catalog").then((page) => page.Catalog),
            loadChildren: () => import("../catalog/catalog").then((page) => page.CATALOG_ROUTES),
          },
        ]
      : []),
    { path: "**", redirectTo: "" },
  ];
}

/** The routes of this build: with the catalog only in development. */
export const APP_ROUTES: Routes = appRoutes(isDevMode());
