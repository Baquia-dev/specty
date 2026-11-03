// SPDX-License-Identifier: Apache-2.0
import * as z from "zod";
import { isBranchName } from "../branches";

/** `memory` in `.specty/config.yaml`: Specty's memory of the sessions and their work (ADR 0016). */
export interface MemoryConfig {
  /** Minutes without a step of any session after which a change waiting for the agent is orphaned. */
  readonly orphanAfterMin: number;
  /** The branch of its own where the memory's entries live, never checked out (formats.md §1). */
  readonly branch: string;
}

export const DEFAULT_MEMORY: MemoryConfig = { orphanAfterMin: 60, branch: "specty-memory" };

export const MemorySchema = z.strictObject({
  orphanAfterMin: z.number().int().positive().optional(),
  // `specty/` holds the changes' branches, where `status` and `prune` look for changes.
  branch: z
    .string()
    .refine(
      (branch) => isBranchName(branch) && branch.length > 0 && !branch.startsWith("specty/"),
      {
        message: "a valid branch name outside specty/",
      },
    )
    .optional(),
});

/** The `memory` section with its defaults applied. */
export function resolveMemory(memory: z.infer<typeof MemorySchema> | undefined): MemoryConfig {
  return {
    orphanAfterMin: memory?.orphanAfterMin ?? DEFAULT_MEMORY.orphanAfterMin,
    branch: memory?.branch ?? DEFAULT_MEMORY.branch,
  };
}
