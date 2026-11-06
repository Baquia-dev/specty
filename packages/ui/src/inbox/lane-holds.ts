// SPDX-License-Identifier: Apache-2.0
// Who holds the change of a line of an epic's card in the Inbox, and what it warns of: the marks
// the server gives each open change (`holder`, `orphan`, `away`) and the files it shares with
// other open changes, naming a slice of the same epic by its id. Pure.
import { agentName } from "../data/agent-name";
import type { ListedChange } from "../data/records";

/** Who holds a line's open change, and what it warns of. */
export interface LaneHolds {
  /** The agent of the conversation that stepped last in its folder, by its name; none for an orphan. */
  readonly agent?: string;
  /** No conversation holds it. */
  readonly orphan: boolean;
  /** Its conversation stepped last in another folder: its agent, by its name. */
  readonly away?: string;
  /**
   * The files it shares with other open changes, and each of those once: a slice of the same
   * epic by its id, another change by its title between «».
   */
  readonly shared?: { readonly paths: readonly string[]; readonly with: readonly string[] };
}

/**
 * Who holds the open change `id` among `loaded`, the epic's changes the Inbox has, and what it
 * warns of; nothing for a line without a change, one not loaded, or one finished or cancelled.
 */
export function laneHolds(
  id: string | undefined,
  loaded: readonly ListedChange[],
): LaneHolds | undefined {
  const change = loaded.find((one) => one.id === id);
  if (change === undefined || change.phase === "done" || change.phase === "cancelled") {
    return undefined;
  }
  const orphan = change.orphan === true;
  const shared = sharedWith(change, loaded);
  return {
    ...(orphan || change.holder === undefined ? {} : { agent: agentName(change.holder.tool) }),
    orphan,
    ...(change.away === undefined ? {} : { away: agentName(change.away.tool) }),
    ...(shared === undefined ? {} : { shared }),
  };
}

/** Whether a line has something to say of who holds it: its agent, or a notice. */
export function saysSomething(holds: LaneHolds): boolean {
  return (
    holds.orphan ||
    holds.agent !== undefined ||
    holds.away !== undefined ||
    holds.shared !== undefined
  );
}

/**
 * The files `change` shares, and each change it shares them with once: by its slice when it is a
 * loaded slice of the same epic, by its title when not, as the row names it.
 */
function sharedWith(change: ListedChange, loaded: readonly ListedChange[]): LaneHolds["shared"] {
  const files = change.shared ?? [];
  if (files.length === 0) return undefined;
  const epic = change.epic?.id;
  const sliceOf = (other: string): string | undefined => {
    const found = loaded.find((one) => one.id === other)?.epic;
    return epic !== undefined && found?.id === epic ? found.slice : undefined;
  };
  const names = files.flatMap((file) =>
    file.changes.map(({ id, title }) => sliceOf(id) ?? `«${title}»`),
  );
  return { paths: files.map((file) => file.path), with: [...new Set(names)] };
}
