// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";

/** How a check counts: its failures fail `specty check`, only warn, or it does not run. */
export type CheckLevel = "error" | "warn" | "off";

/** `checks` in `.specty/config.yaml`: what `specty check` runs and how much it prints. */
export interface ChecksConfig {
  /** Level of each check by its id; a check not listed is `error`. */
  readonly levels: Readonly<Record<string, CheckLevel>>;
  /** Findings shown per check before «… and N more». */
  readonly maxFindings: number;
  /** Paths no check looks at, on top of the ignored and generated ones. */
  readonly exclude: readonly string[];
}

export const DEFAULT_CHECKS: ChecksConfig = {
  levels: {},
  maxFindings: 10,
  // Dependencies and build artifacts, by folder names common to every ecosystem.
  exclude: [
    "**/node_modules/**",
    "**/build/**",
    "**/dist/**",
    "**/out/**",
    "**/target/**",
    "**/coverage/**",
    "**/vendor/**",
    "**/.dart_tool/**",
    "**/.next/**",
    "**/.angular/**",
    "**/.gradle/**",
  ],
};

export const ChecksSchema = z.strictObject({
  levels: z.record(z.string(), z.enum(["error", "warn", "off"])).optional(),
  maxFindings: z.number().int().positive().optional(),
  exclude: z.array(z.string().min(1)).optional(),
});

export function resolveChecks(input: z.infer<typeof ChecksSchema> | undefined): ChecksConfig {
  return {
    levels: input?.levels ?? DEFAULT_CHECKS.levels,
    maxFindings: input?.maxFindings ?? DEFAULT_CHECKS.maxFindings,
    exclude: input?.exclude ?? DEFAULT_CHECKS.exclude,
  };
}

/** The level of the check `id`: what the configuration says, or `error`. */
export function checkLevel(config: { readonly checks: ChecksConfig }, id: string): CheckLevel {
  return config.checks.levels[id] ?? "error";
}
