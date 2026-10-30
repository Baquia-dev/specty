// SPDX-License-Identifier: Apache-2.0
import { DOCUMENT } from "@angular/common";
import { Injectable, inject } from "@angular/core";
import { Preferences, type Theme } from "./preferences";

type Context = Readonly<Record<string, unknown>>;

const isContext = (value: unknown): value is Context =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const THEMES: readonly Theme[] = ["light", "dark"];

/**
 * The look an MCP host gives the view (MCP Apps' `hostContext`): its theme and the CSS variables
 * of its chat. From its sandboxed frame the view cannot read the chat's colors, so it takes them
 * from here: the host's theme wins over the system's, and each variable goes on the root, where
 * `styles.css` maps Specty's colors to them. An update brings only what changed.
 */
@Injectable({ providedIn: "root" })
export class HostLook {
  private readonly preferences = inject(Preferences);
  private readonly root = inject(DOCUMENT).documentElement;

  /** Takes what a (partial) host context says about the look; anything else is ignored. */
  take(context: unknown): void {
    if (!isContext(context)) return;
    const theme = THEMES.find((candidate) => candidate === context.theme);
    if (theme !== undefined) this.preferences.theme.set(theme);
    const { styles } = context;
    const variables = isContext(styles) ? styles.variables : undefined;
    if (!isContext(variables)) return;
    for (const [name, value] of Object.entries(variables)) {
      if (name.startsWith("--") && typeof value === "string") {
        this.root.style.setProperty(name, value);
      }
    }
  }
}
