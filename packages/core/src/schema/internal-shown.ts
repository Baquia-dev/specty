// SPDX-License-Identifier: Apache-2.0
import * as z from "zod";
import { DEFAULT_FINDING_LIMITS, type FindingLimits } from "../checks/output";

/**
 * `internal.findings` and `internal.commands` in `.specty/config.yaml`: how much Specty shows of
 * the output of a failing command of `checks.commands`, of a failure in `specty verify --fresh`
 * and of a file's history in `specty why` (formats.md §6).
 */
export interface InternalShownConfig {
  /** What `specty check` takes from the output of a failing command of `checks.commands`. */
  readonly findings: FindingLimits;
  readonly commands: {
    /** The last lines of a failed attempt that `specty verify --fresh` shows. */
    readonly verifyLines: number;
    /** How many changes, the newest, `specty why <file>` lists. */
    readonly whyEntries: number;
  };
}

export const DEFAULT_INTERNAL_SHOWN: InternalShownConfig = {
  findings: DEFAULT_FINDING_LIMITS,
  commands: { verifyLines: 20, whyEntries: 10 },
};

/** A whole number from `min` to `max`, optional. */
const between = (min: number, max: number) => z.number().int().min(min).max(max).optional();

/**
 * The blocks of `internal` this module owns, for `config.ts` to gather under `internal`. The
 * lowest values still say what failed: ten findings fill the page of `checks.maxFindings`, one
 * line and 50 characters still name the failure, five lines still hold its end and one entry of
 * `why` still gives the last change. The highest bound what a card gives the agent.
 */
export const INTERNAL_SHOWN_SHAPE = {
  findings: z
    .strictObject({
      perCommand: between(10, 1000),
      lastLines: between(1, 50),
      messageChars: between(50, 2000),
    })
    .optional(),
  commands: z
    .strictObject({ verifyLines: between(5, 200), whyEntries: between(1, 100) })
    .optional(),
};

/** What `config.yaml` may hold of these blocks under `internal`. */
interface InternalShownInput {
  readonly findings?: z.infer<typeof INTERNAL_SHOWN_SHAPE.findings>;
  readonly commands?: z.infer<typeof INTERNAL_SHOWN_SHAPE.commands>;
}

/** The `internal.findings` and `internal.commands` blocks with their defaults applied. */
export function resolveInternalShown(input: InternalShownInput | undefined): InternalShownConfig {
  const { findings, commands } = DEFAULT_INTERNAL_SHOWN;
  return {
    findings: {
      perCommand: input?.findings?.perCommand ?? findings.perCommand,
      lastLines: input?.findings?.lastLines ?? findings.lastLines,
      messageChars: input?.findings?.messageChars ?? findings.messageChars,
    },
    commands: {
      verifyLines: input?.commands?.verifyLines ?? commands.verifyLines,
      whyEntries: input?.commands?.whyEntries ?? commands.whyEntries,
    },
  };
}
