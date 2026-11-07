// SPDX-License-Identifier: Apache-2.0
// The panel's «Alcance e integraciones» (docs/ui.md, «Panel»): how far the work of the changes
// of a period went out of its plan and what merging main took, each by the day of its event.
import { inRange, type StatsRange } from "./period";
import type { StatsRow } from "./rows";

/** The scope requests decided, the merges of main that stopped and the adjustments of a period. */
export interface StatsScope {
  /** The `scope.decided` of the period, by decision: by Specty on its own, approved, rejected. */
  readonly requests: Readonly<Record<StatsRow["scope"][number]["decision"], number>>;
  /** The `integration.started` of the period, by reason, and how many changes had one. */
  readonly integrations: {
    readonly verify: number;
    readonly conflicts: number;
    readonly changes: number;
  };
  /** The `adjust.requested` of the period, and how many changes had one. */
  readonly adjustments: { readonly requested: number; readonly changes: number };
}

/** The scope, the integrations and the adjustments of `rows` in `range`. */
export function statsScope(rows: readonly StatsRow[], range: StatsRange): StatsScope {
  const within = <Fact extends { readonly day: string }>(facts: readonly Fact[]) =>
    facts.filter((one) => inRange(one.day, range));
  const decided = rows.flatMap((row) => within(row.scope));
  const stopped = rows.map((row) => within(row.integrations));
  const adjusted = rows.map((row) => row.adjustments.filter((day) => inRange(day, range)));
  const decisions = (decision: StatsRow["scope"][number]["decision"]) =>
    decided.filter((one) => one.decision === decision).length;
  const reasons = (reason: StatsRow["integrations"][number]["reason"]) =>
    stopped.flat().filter((one) => one.reason === reason).length;
  return {
    requests: {
      auto: decisions("auto"),
      approved: decisions("approved"),
      rejected: decisions("rejected"),
    },
    integrations: {
      verify: reasons("verify"),
      conflicts: reasons("conflicts"),
      changes: stopped.filter((own) => own.length > 0).length,
    },
    adjustments: {
      requested: adjusted.flat().length,
      changes: adjusted.filter((own) => own.length > 0).length,
    },
  };
}
