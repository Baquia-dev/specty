// SPDX-License-Identifier: Apache-2.0
import * as z from "zod";
import { isRegex } from "./checks";

/**
 * `usage` and `warnings` in `.specty/config.yaml`: the warnings of the sessions (the advice of a
 * fresh session and the ccusage that measures each change), those of the spec (the person's
 * vague terms and horizontal layers) and those of the content a task adds (the person's risk
 * rules), all added to Specty's, which stay (formats.md §6).
 */
export interface WarningsConfig {
  readonly usage: {
    /** Beyond this context, the closing advises a fresh session for the next change. */
    readonly freshSessionTokens: number;
    readonly ccusage: {
      /** How long Specty waits for each report of ccusage before going on without it. */
      readonly timeoutSec: number;
      /** The version `doctor` says to install when ccusage is missing. */
      readonly version: string;
    };
  };
  readonly warnings: {
    /** Words or phrases a criterion should not use, added to Specty's. */
    readonly vagueTerms: readonly string[];
    /** Words or phrases that make an epic's slice a horizontal layer, added to Specty's. */
    readonly horizontalLayers: readonly string[];
    /** Patterns `task done` looks for in the lines a task adds, added to Specty's. */
    readonly risks: readonly CustomRiskRule[];
  };
}

/** A risk rule of the person: a pattern for each added line, and what the warning says. */
export interface CustomRiskRule {
  /** The warning's text, as the person wrote it. */
  readonly label: string;
  /** A JavaScript regular expression, with no flags. */
  readonly pattern: string;
  readonly cwe?: string | undefined;
  /** The extensions it looks at, without the dot; every file's, when absent. */
  readonly extensions?: readonly string[] | undefined;
}

export const DEFAULT_WARNINGS: WarningsConfig = {
  usage: { freshSessionTokens: 150_000, ccusage: { timeoutSec: 60, version: "20.0.45" } },
  warnings: { vagueTerms: [], horizontalLayers: [], risks: [] },
};

/** `x.y.z`, with an optional pre-release tag: it goes into a command the person copies. */
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?$/;
const Terms = z.array(z.string().trim().min(1));
const RiskRule = z.strictObject({
  label: z.string().trim().min(1),
  pattern: z.string().min(1).refine(isRegex, { error: "Not a valid regular expression." }),
  cwe: z
    .string()
    .regex(/^CWE-\d+$/)
    .optional(),
  extensions: z.array(z.string().regex(/^[0-9A-Za-z]+$/)).optional(),
});

/**
 * The blocks this module owns, for `config.ts` to spread among its keys. Closing waits for each
 * report of ccusage, so its time goes from 1 s to 10 min.
 */
export const WARNINGS_SHAPE = {
  usage: z
    .strictObject({
      freshSessionTokens: z.number().int().positive().optional(),
      ccusage: z
        .strictObject({
          timeoutSec: z.number().int().min(1).max(600).optional(),
          version: z.string().regex(VERSION).optional(),
        })
        .optional(),
    })
    .optional(),
  warnings: z
    .strictObject({
      vagueTerms: Terms.optional(),
      horizontalLayers: Terms.optional(),
      risks: z.array(RiskRule).optional(),
    })
    .optional(),
};

/** What `config.yaml` may hold of these blocks. */
interface WarningsInput {
  readonly usage?: z.infer<typeof WARNINGS_SHAPE.usage>;
  readonly warnings?: z.infer<typeof WARNINGS_SHAPE.warnings>;
}

/** The `usage` and `warnings` blocks with their defaults applied. */
export function resolveWarnings(input: WarningsInput): WarningsConfig {
  const { usage, warnings } = DEFAULT_WARNINGS;
  return {
    usage: {
      freshSessionTokens: input.usage?.freshSessionTokens ?? usage.freshSessionTokens,
      ccusage: {
        timeoutSec: input.usage?.ccusage?.timeoutSec ?? usage.ccusage.timeoutSec,
        version: input.usage?.ccusage?.version ?? usage.ccusage.version,
      },
    },
    warnings: {
      vagueTerms: input.warnings?.vagueTerms ?? warnings.vagueTerms,
      horizontalLayers: input.warnings?.horizontalLayers ?? warnings.horizontalLayers,
      risks: input.warnings?.risks ?? warnings.risks,
    },
  };
}
