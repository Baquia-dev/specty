// SPDX-License-Identifier: Apache-2.0
import type { Routes } from "@angular/router";

/** Every screen loads on demand: the first load carries only the shell. */
export const APP_ROUTES: Routes = [
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
  {
    path: "catalog",
    loadComponent: () => import("../catalog/catalog").then((page) => page.Catalog),
    loadChildren: () => import("../catalog/catalog").then((page) => page.CATALOG_ROUTES),
  },
  { path: "**", redirectTo: "" },
];
