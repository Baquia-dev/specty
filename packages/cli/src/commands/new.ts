// SPDX-License-Identifier: Apache-2.0
import {
  blockedCard,
  type ChangeKind,
  headerOf,
  makeChangeId,
  nextCard,
  type Output,
  specTemplate,
  translator,
  withLead,
} from "@baquia-dev/specty-core";
import { commitState, isFinished, resolveActive } from "../flow/active";
import { changeView } from "../flow/views";
import { exists, writeText } from "../io/files";
import type { Session } from "../session";
import { initialState } from "../store/changes";
import { writePointer } from "../store/local";
import { changeFiles } from "../store/paths";
import { dirtyGoverned } from "./next";

export interface NewOptions {
  readonly title: string;
  readonly kind: ChangeKind;
  readonly follows: readonly string[];
  readonly epic?: string;
  readonly slice?: string;
  readonly timebox?: string;
}

/** `specty new`: creates the change, its branch and the spec skeleton. */
export async function newChange(session: Session, options: NewOptions): Promise<Output> {
  const t = translator(session.lang);
  const { cards } = session;
  const title = options.title.trim();
  if (title.length === 0) {
    return {
      ...blockedCard(
        headerOf(),
        t("Falta el título.", "The title is missing."),
        t(
          `ejecuta \`${cards.command} new "<título>"\`.`,
          `run \`${cards.command} new "<title>"\`.`,
        ),
      ),
      status: "invalid",
    };
  }
  const active = await resolveActive(session);
  if (active !== undefined && !isFinished(active.state)) {
    return blockedCard(
      headerOf(active.state.id, active.state.phase),
      t(
        `Ya hay un cambio en curso: ${active.state.id}.`,
        `A change is already in progress: ${active.state.id}.`,
      ),
      t(
        `termínalo (\`${cards.command} next\`) o cámbiate a otra rama antes de crear otro.`,
        `finish it (\`${cards.command} next\`) or switch to another branch before creating a new one.`,
      ),
    );
  }
  const dirty = await dirtyGoverned(session);
  if (dirty.length > 0) return nextCard({ dirty }, cards);

  const id = await uniqueId(session, makeChangeId(session.environment.now(), title));
  const branch = session.config.git.branchPerChange
    ? `${options.kind === "spike" ? "spike" : "specty"}/${id}`
    : undefined;
  if (branch !== undefined) await session.git.output(["switch", "-q", "-c", branch]);
  else await writePointer(session.git, "active", id);

  const files = changeFiles(session.paths.changeDir(id));
  await writeText(
    files.spec,
    specTemplate({
      kind: options.kind,
      lang: session.lang,
      title,
      follows: options.follows,
      ...(options.epic !== undefined ? { epic: options.epic } : {}),
      ...(options.slice !== undefined ? { slice: options.slice } : {}),
      ...(options.timebox !== undefined ? { timebox: options.timebox } : {}),
    }),
  );
  const state = initialState({
    id,
    kind: options.kind,
    branch,
    baseCommit: await session.git.head(),
  });
  const created = await commitState(
    session,
    { files, state, archived: false },
    state,
    "change.created",
    {
      kind: options.kind,
      ...(branch !== undefined ? { branch } : {}),
      ...(options.follows.length > 0 ? { follows: options.follows } : {}),
    },
  );
  const where = branch === undefined ? "" : t(` (rama ${branch})`, ` (branch ${branch})`);
  return withLead(
    t(`Cambio creado: ${id}${where}.`, `Change created: ${id}${where}.`),
    nextCard({ change: await changeView(session, created), dirty: [] }, cards),
  );
}

async function uniqueId(session: Session, base: string, attempt = 1): Promise<string> {
  const candidate = attempt === 1 ? base : `${base}-${attempt}`;
  const taken =
    (await exists(session.paths.changeDir(candidate))) ||
    (await session.git.run(["rev-parse", "--verify", "-q", `refs/heads/specty/${candidate}`]))
      .code === 0;
  return taken ? uniqueId(session, base, attempt + 1) : candidate;
}
