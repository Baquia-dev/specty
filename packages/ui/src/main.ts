// SPDX-License-Identifier: Apache-2.0
import { bootstrapApplication } from "@angular/platform-browser";
import { provideRouter, withComponentInputBinding } from "@angular/router";
import { APP_ROUTES } from "./app/routes";
import { Shell } from "./app/shell";
import { FixtureData } from "./data/fixtures";
import { SpectyData } from "./data/records";

// Zoneless by default: there is no zone.js in the bundle. The prototype runs on sample data;
// the local server will provide its own SpectyData.
bootstrapApplication(Shell, {
  providers: [
    provideRouter(APP_ROUTES, withComponentInputBinding()),
    { provide: SpectyData, useClass: FixtureData },
  ],
}).catch((error: unknown) => console.error(error));
