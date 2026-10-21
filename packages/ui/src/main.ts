// SPDX-License-Identifier: Apache-2.0
import { bootstrapApplication } from "@angular/platform-browser";
import { provideRouter } from "@angular/router";
import { CATALOG_ROUTES, Catalog } from "./catalog/catalog";

// Zoneless by default: there is no zone.js in the bundle.
bootstrapApplication(Catalog, { providers: [provideRouter(CATALOG_ROUTES)] }).catch(
  (error: unknown) => console.error(error),
);
