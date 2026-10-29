// SPDX-License-Identifier: Apache-2.0
import { bootstrapApplication } from "@angular/platform-browser";
import {
  provideRouter,
  withComponentInputBinding,
  withDisabledInitialNavigation,
} from "@angular/router";
import { APP_ROUTES } from "./app/routes";
import { Shell } from "./app/shell";
import { SpectyData } from "./data/records";
import { dataSource } from "./data/server";

/** The mark of the page an MCP App serves (ADR 0015): the change of a tool, in the chat. */
const MCP_APP = 'meta[name="specty-data"][content="mcp-app"]';

/**
 * The embedded view of one change, with no routes. Loaded on demand, so its tabs stay out of the
 * initial bundle of `specty ui`; the MCP App's page carries everything in one file anyway.
 */
async function embedded(): Promise<void> {
  const [{ Embedded }, { McpAppData }] = await Promise.all([
    import("./app/embedded"),
    import("./data/mcp-app"),
  ]);
  await bootstrapApplication(Embedded, {
    providers: [
      provideRouter([], withDisabledInitialNavigation()),
      { provide: SpectyData, useClass: McpAppData },
    ],
  });
}

/**
 * Zoneless by default: there is no zone.js in the bundle. Served by `specty ui`, the app reads the
 * local server; anywhere else, the prototype's sample data, which only loads then.
 */
async function app(): Promise<void> {
  const source = await dataSource(document);
  await bootstrapApplication(Shell, {
    providers: [
      provideRouter(APP_ROUTES, withComponentInputBinding()),
      { provide: SpectyData, useClass: source },
    ],
  });
}

(document.querySelector(MCP_APP) === null ? app() : embedded()).catch((error: unknown) =>
  console.error(error),
);
