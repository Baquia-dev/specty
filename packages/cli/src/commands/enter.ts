// SPDX-License-Identifier: Apache-2.0
import { enteredCard, noFolderCard, type Output } from "@baquia-dev/specty-core";
import { namedWorktree } from "../enforce/worktree-hooks";
import { worktreesHome } from "../flow/worktree";
import { openSession, type Session } from "../session";
import { next } from "./next";

/**
 * `specty enter <id>`: the agent's conversation goes on in the folder `specty new` prepared for
 * the change, without opening another session. The guard of its tool binds the conversation
 * there before the command runs (`enforce/sessions.ts`); the command says where it works now and
 * what `next` says in that folder.
 */
export async function enter(session: Session, id: string): Promise<Output> {
  const named = await namedWorktree(session.git, id);
  const opened = named.prepared
    ? await openSession({ ...session.environment, cwd: named.folder })
    : undefined;
  if (opened?.kind !== "ok") {
    return noFolderCard(id, await worktreesHome(session.git), session.cards);
  }
  return enteredCard(named.folder, await next(opened.session), session.cards);
}
