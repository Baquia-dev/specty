// SPDX-License-Identifier: Apache-2.0
import * as z from "zod";
import { CHANGE_ID } from "../ids";

const Hash = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const Commit = z.string().regex(/^[0-9a-f]{7,40}$/);
const Timestamp = z.iso.datetime();
const Count = z.number().int().min(0);

export const PhaseSchema = z.enum([
  "draft",
  "review",
  "testing",
  "implementing",
  "acceptance",
  "adjusting",
  "closing",
  "done",
  "cancelled",
]);

const TaskStateSchema = z.strictObject({
  status: z.enum(["pending", "active", "done"]),
  baseCommit: Commit.optional(),
  commit: Commit.optional(),
  attempts: Count,
  startedAt: Timestamp.optional(),
  doneAt: Timestamp.optional(),
  summary: z.string().min(1).optional(),
  scopeExtra: z.array(z.string().min(1)),
});

/**
 * What an unlock of an approved test may carry (ADR 0014): the lines of its patch, how many pieces
 * of evidence, and the lines of each.
 */
export const UNLOCK_LIMITS = { patchLines: 500, evidence: 5, evidenceLines: 40 } as const;

/** Lines of a file git tracks that justify an unlock, as they were when it was asked. */
const UnlockEvidenceSchema = z.strictObject({
  path: z.string().min(1),
  /** The first line, counted from 1. */
  from: z.number().int().min(1),
  /** The last line, included. */
  to: z.number().int().min(1),
  text: z.string(),
});

export type UnlockEvidence = z.infer<typeof UnlockEvidenceSchema>;

const ScopeRequestSchema = z.strictObject({
  id: z.string().regex(/^S[1-9]\d*$/),
  task: z.string().regex(/^T[1-9]\d*$/),
  paths: z.array(z.string().min(1)).min(1),
  reason: z.string().min(1),
  /** Made by `retro --into`: the print of the staged code it documents (ARCHITECTURE §9). */
  retro: z.string().min(1).optional(),
  /** An unlock of approved tests: the exact change to them, as a unified diff (ADR 0014). */
  patch: z.string().min(1).optional(),
  /** An unlock of approved tests: the lines that justify it. */
  evidence: z.array(UnlockEvidenceSchema).min(1).max(UNLOCK_LIMITS.evidence).optional(),
});

/**
 * Bringing the main branch into the change failed (conflicts, or the verification fails on the
 * result) and the merge waits in the change's folder for the agent (ARCHITECTURE §9).
 */
const IntegrationSchema = z.strictObject({
  /** The branch the change goes to. */
  target: z.string().min(1),
  /** The commit of `target` being merged. */
  commit: Commit,
  reason: z.enum(["conflicts", "verify"]),
  conflicts: z.array(z.string().min(1)),
  /** What either side changed since their common base: the only files the agent may touch. */
  paths: z.array(z.string().min(1)),
  /** The approved tests the person unlocked for this incorporation (ADR 0014). */
  unlocked: z.array(z.string().min(1)).optional(),
  at: Timestamp,
  /** Kept once resolved, so the person sees what the agent did when closing. */
  resolved: z.strictObject({ commit: Commit, at: Timestamp }).optional(),
});

export type IntegrationState = z.infer<typeof IntegrationSchema>;

/** `.specty/changes/<id>/state.json`. Only Specty writes it. */
export const ChangeStateSchema = z.strictObject({
  schema: z.literal(1),
  id: z.string().regex(CHANGE_ID),
  kind: z.enum(["quick", "standard", "spike", "retro", "epic"]),
  phase: PhaseSchema,
  branch: z.string().min(1).optional(),
  baseCommit: Commit.optional(),
  revision: Count,
  approved: z
    .strictObject({
      revision: z.number().int().min(1),
      hash: Hash,
      at: Timestamp,
      by: z.string().min(1),
      // `delegated`: the agent approved for the person, who turned delegated mode on (ADR 0010).
      channel: z.enum(["ui", "tty", "pr", "delegated"]),
    })
    .optional(),
  size: z
    .strictObject({
      level: z.enum(["S", "M", "L", "XL"]),
      score: Count,
      adjust: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
      reasons: z.array(z.string()),
    })
    .optional(),
  items: z.record(
    z.string(),
    z.strictObject({
      hash: Hash,
      decision: z.enum(["pending", "confirmed", "rejected", "implicit"]),
      /** Why a person rejected the item, shown to the agent. */
      comment: z.string().min(1).optional(),
    }),
  ),
  tasks: z.record(z.string().regex(/^T[1-9]\d*$/), TaskStateSchema),
  pending: z.strictObject({
    scopeRequests: z.array(ScopeRequestSchema),
    adjustment: z.strictObject({ request: z.string().min(1), at: Timestamp }).nullable(),
  }),
  /** Highest number ever used per prefix (items and `S` scope requests): ids are never reused. */
  maxIds: z.partialRecord(z.enum(["A", "AC", "T", "R", "C", "S"]), Count),
  closingSubmittedAt: Timestamp.optional(),
  /** In the testing phase, the tests were sent and wait for the person's approval (ADR 0014). */
  testsSubmittedAt: Timestamp.optional(),
  /**
   * In review, the person sent it back (asked for changes or rejected assumptions): the turn is
   * the agent's until its next proposal.
   */
  changesRequestedAt: Timestamp.optional(),
  /** The tests the person approved, locked by path to the hash of their content (ADR 0014). */
  lockedTests: z.record(z.string().min(1), Hash).optional(),
  /** In the testing phase, the cycle its approval decided: a feature's or a bug's (ADR 0014). */
  testCycle: z.enum(["feature", "bug"]).optional(),
  integration: IntegrationSchema.optional(),
});

/** True while an incorporation waits for the agent. */
export function isIntegrating(state: Pick<ChangeState, "integration">): boolean {
  return state.integration !== undefined && state.integration.resolved === undefined;
}

export type ChangeState = z.infer<typeof ChangeStateSchema>;

export type StateResult =
  | { readonly ok: true; readonly state: ChangeState }
  | { readonly ok: false; readonly issues: readonly string[] };

export function parseChangeState(input: unknown): StateResult {
  const parsed = ChangeStateSchema.safeParse(input);
  if (parsed.success) return { ok: true, state: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues.map(
      (issue) => `${issue.path.map(String).join(".")}: ${issue.message}`,
    ),
  };
}
