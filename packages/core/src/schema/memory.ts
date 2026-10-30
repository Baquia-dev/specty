// SPDX-License-Identifier: Apache-2.0
import * as z from "zod";

/** `memory` in `.specty/config.yaml`: Specty's memory of the sessions and their work (ADR 0016). */
export interface MemoryConfig {
  /** Minutes without a step of any session after which a change waiting for the agent is orphaned. */
  readonly orphanAfterMin: number;
}

export const DEFAULT_MEMORY: MemoryConfig = { orphanAfterMin: 60 };

export const MemorySchema = z.strictObject({
  orphanAfterMin: z.number().int().positive().optional(),
});

/** The `memory` section with its defaults applied. */
export function resolveMemory(memory: z.infer<typeof MemorySchema> | undefined): MemoryConfig {
  return { orphanAfterMin: memory?.orphanAfterMin ?? DEFAULT_MEMORY.orphanAfterMin };
}
