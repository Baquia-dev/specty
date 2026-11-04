// SPDX-License-Identifier: Apache-2.0
import { type DuplicateView, duplicateReason, parseSpec } from "@baquia-dev/specty-core";
import { openChanges } from "../commands/status";
import type { Session } from "../session";
import { readSpec } from "../store/changes";
import { isFinished } from "./active";
import { dataOf, readAudit } from "./carried";
import { locateChanges } from "./changes";
import { findChange } from "./find";

/** The change `new` is about to create, and the open changes it does not compare with. */
export interface DuplicateQuery {
  readonly title: string;
  readonly request?: string;
  readonly follows: readonly string[];
  /** The epic of the slice being created: a slice looks like its epic on purpose. */
  readonly epic?: string;
  /** Open changes the user said it does not duplicate (`--distinct-from`). */
  readonly distinctFrom: readonly string[];
}

/**
 * The open changes of every worktree a new change may duplicate (ADR 0016), as `status` sees
 * them, each with why: the same `follows`, a similar title or a similar request. Those it follows,
 * their epics, its own epic and those of `--distinct-from` do not count.
 */
export async function duplicatesOf(
  session: Session,
  query: DuplicateQuery,
): Promise<DuplicateView[]> {
  const epic = query.epic === undefined ? [] : [query.epic];
  const followed = await epicsOf(session, query.follows);
  const skipped = new Set([...query.follows, ...query.distinctFrom, ...epic, ...followed]);
  const located = (await locateChanges(session)).filter(
    ({ change }) => !isFinished(change.state) && !skipped.has(change.state.id),
  );
  const candidate = {
    title: query.title,
    ...(query.request !== undefined ? { request: query.request } : {}),
    follows: query.follows,
  };
  const hits = await Promise.all(
    located.map(async ({ change, session: there }) => {
      const spec = parseSpec(await readSpec(change.files), { language: there.lang }).spec;
      const created = (await readAudit(change.files)).find(
        (entry) => entry.event === "change.created",
      );
      const { request } = dataOf(created);
      const other = {
        title: spec.title,
        ...(typeof request === "string" ? { request } : {}),
        follows: spec.frontmatter.follows,
      };
      const reason = duplicateReason(candidate, other);
      return reason === undefined ? [] : [{ id: change.state.id, reason }];
    }),
  );
  const found = hits.flat();
  return withViews(session, found);
}

/**
 * The epics of the changes `ids`, open or archived: following a slice is working on its epic. One
 * that is not found, or is no slice, adds none.
 */
async function epicsOf(session: Session, ids: readonly string[]): Promise<string[]> {
  const epics = await Promise.all(
    ids.map(async (id) => {
      const change = await findChange(session, id);
      if (change === undefined) return undefined;
      return parseSpec(await readSpec(change.files), { language: session.lang }).spec.frontmatter
        .epic;
    }),
  );
  return epics.filter((epic): epic is string => epic !== undefined);
}

/** Each change found with its view as `status` sees it. */
async function withViews(
  session: Session,
  found: readonly { readonly id: string; readonly reason: DuplicateView["reason"] }[],
): Promise<DuplicateView[]> {
  if (found.length === 0) return [];
  const views = await openChanges(session);
  return found.flatMap(({ id, reason }) => {
    const change = views.find((view) => view.id === id);
    return change === undefined ? [] : [{ change, reason }];
  });
}
