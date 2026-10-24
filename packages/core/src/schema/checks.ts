// SPDX-License-Identifier: Apache-2.0
import * as z from "zod";

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
  readonly todo: TodoConfig;
}

/** What the `todo` check looks for: its markers, and what counts as pointing to an issue. */
export interface TodoConfig {
  /** Words that, first in a comment, mark pending work; case matters. */
  readonly markers: readonly string[];
  /** Regular expression for a reference to an issue, searched after the marker. */
  readonly reference: string;
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
  // An issue number (`#12`, `acme/app#12`), a tracker key (`ABC-12`) or a link.
  todo: {
    markers: ["TODO", "FIXME"],
    reference: String.raw`#\d+|\b[A-Z][A-Z0-9]+-\d+\b|https?://\S+`,
  },
};

function isRegex(source: string): boolean {
  try {
    new RegExp(source);
    return true;
  } catch {
    return false;
  }
}

export const ChecksSchema = z.strictObject({
  levels: z.record(z.string(), z.enum(["error", "warn", "off"])).optional(),
  maxFindings: z.number().int().positive().optional(),
  exclude: z.array(z.string().min(1)).optional(),
  todo: z
    .strictObject({
      markers: z.array(z.string().min(1)).min(1).optional(),
      reference: z
        .string()
        .min(1)
        .refine(isRegex, { error: "Not a valid regular expression." })
        .optional(),
    })
    .optional(),
});

export function resolveChecks(input: z.infer<typeof ChecksSchema> | undefined): ChecksConfig {
  return {
    levels: input?.levels ?? DEFAULT_CHECKS.levels,
    maxFindings: input?.maxFindings ?? DEFAULT_CHECKS.maxFindings,
    exclude: input?.exclude ?? DEFAULT_CHECKS.exclude,
    todo: {
      markers: input?.todo?.markers ?? DEFAULT_CHECKS.todo.markers,
      reference: input?.todo?.reference ?? DEFAULT_CHECKS.todo.reference,
    },
  };
}

/** The level of the check `id`: what the configuration says, or `error`. */
export function checkLevel(config: { readonly checks: ChecksConfig }, id: string): CheckLevel {
  return config.checks.levels[id] ?? "error";
}
