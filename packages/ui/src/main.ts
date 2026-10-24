// SPDX-License-Identifier: Apache-2.0
import { bootstrapApplication } from "@angular/platform-browser";
import { provideRouter, withComponentInputBinding } from "@angular/router";
import { APP_ROUTES } from "./app/routes";
import { Shell } from "./app/shell";
import { SpectyData } from "./data/records";
import { dataSource } from "./data/server";

// Zoneless by default: there is no zone.js in the bundle. Served by `specty ui`, the app reads the
// local server; anywhere else, the prototype's sample data, which only loads then.
dataSource(document)
  .then((source) =>
    bootstrapApplication(Shell, {
      providers: [
        provideRouter(APP_ROUTES, withComponentInputBinding()),
        { provide: SpectyData, useClass: source },
      ],
    }),
  )
  .catch((error: unknown) => console.error(error));
