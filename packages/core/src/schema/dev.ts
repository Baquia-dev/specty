// SPDX-License-Identifier: Apache-2.0
import * as z from "zod";

/** `dev` in `.specty/config.yaml`: what the project's development servers use. */
export interface DevConfig {
  /**
   * The project's development ports, as the main folder uses them. Each change's folder gets them
   * plus its own place (ARCHITECTURE §9), so two folders' servers do not clash. Empty: none.
   */
  readonly ports: readonly number[];
}

export const DEFAULT_DEV: DevConfig = { ports: [] };

const Port = z.number().int().min(1).max(65_535);

export const DevSchema = z.strictObject({ ports: z.array(Port).optional() });

/** The `dev` section with its defaults applied. */
export function resolveDev(dev: z.infer<typeof DevSchema> | undefined): DevConfig {
  return { ports: dev?.ports ?? DEFAULT_DEV.ports };
}
