// SPDX-License-Identifier: Apache-2.0
import * as z from "zod";

/** A part of the full verification (`verify.units`): its command and the files it reads. */
export interface VerifyUnit {
  readonly name: string;
  readonly command: string;
  /** Globs of the files whose content its result depends on, such as its package's. */
  readonly paths: readonly string[];
}

/** `verify` in `.specty/config.yaml`: how a task's verification and the full one run. */
export interface VerifyConfig {
  readonly default?: string;
  readonly full?: string;
  /** A fast check of the whole repository that runs before each task's verification. */
  readonly quick?: string;
  readonly timeoutSec: number;
  /** Verifications that run at once in the clone: a task's takes one, the full one all. */
  readonly slots: number;
  /**
   * The full verification in parts, run in order in place of `full`: each runs again only when
   * its command or the files of its `paths` change.
   */
  readonly units?: readonly VerifyUnit[];
}

export const DEFAULT_VERIFY: VerifyConfig = { timeoutSec: 600, slots: 2 };

const Positive = z.number().int().positive();

/** The units of the full verification: at least one, each with a name no other has. */
const UnitsSchema = z
  .array(
    z.strictObject({
      name: z.string().min(1),
      command: z.string().min(1),
      paths: z.array(z.string().min(1)).min(1),
    }),
  )
  .min(1)
  .superRefine((units, context) => {
    for (const [index, { name }] of units.entries()) {
      if (units.findIndex((other) => other.name === name) === index) continue;
      context.addIssue({
        code: "custom",
        message: `Another unit is already named ${name}.`,
        path: [index, "name"],
      });
    }
  });

export const VerifySchema = z.strictObject({
  default: z.string().min(1).optional(),
  full: z.string().min(1).optional(),
  quick: z.string().min(1).optional(),
  timeoutSec: Positive.optional(),
  slots: Positive.optional(),
  units: UnitsSchema.optional(),
});

/** The `verify` section with its defaults applied. */
export function resolveVerify(verify: z.infer<typeof VerifySchema> | undefined): VerifyConfig {
  return {
    ...(verify?.default !== undefined ? { default: verify.default } : {}),
    ...(verify?.full !== undefined ? { full: verify.full } : {}),
    ...(verify?.quick !== undefined ? { quick: verify.quick } : {}),
    timeoutSec: verify?.timeoutSec ?? DEFAULT_VERIFY.timeoutSec,
    slots: verify?.slots ?? DEFAULT_VERIFY.slots,
    ...(verify?.units !== undefined ? { units: verify.units } : {}),
  };
}
