// SPDX-License-Identifier: Apache-2.0
import { mkdir, readdir, rmdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { MessageView } from "@baquia-dev/specty-core";
import { isMissing, isRecord, parseJson, readText, remove } from "../io/files";
import type { Git } from "../io/git";

/**
 * The messages between sessions (formats.md §1, ADR 0016): what one session leaves for the
 * session of an open change, one file each in `messages/<id>/`, until that session takes them.
 * Under `common/`, git keeps it in the common directory: every worktree sees it.
 */

const MESSAGES = "common/specty/messages";

/** Leaves `message` for the session of change `id`, after the ones already waiting. */
export async function leaveMessage(git: Git, id: string, message: MessageView): Promise<void> {
  const folder = join(await git.gitPath(MESSAGES), id);
  const text = `${JSON.stringify(message, null, 2)}\n`;
  const stamp = message.at.replace(/[-:.]/g, "");
  let n = 0;
  for (;;) {
    const path = join(folder, `${stamp}-${String(n).padStart(4, "0")}.json`);
    try {
      await writeFile(path, text, { flag: "wx" });
      return;
    } catch (error) {
      // Without its folder, the same name again once it exists; taken, the next one.
      if (isMissing(error)) await mkdir(folder, { recursive: true });
      else if (isRecord(error) && error.code === "EEXIST") n++;
      else throw error;
    }
  }
}

/** Whether any message waits, for any change: one look at the folder, before anything else. */
export async function anyMessages(git: Git): Promise<boolean> {
  const names = await readdir(await git.gitPath(MESSAGES)).catch(() => []);
  return names.length > 0;
}

/** The changes with a folder of messages. */
export async function messageChanges(git: Git): Promise<string[]> {
  const folder = await git.gitPath(MESSAGES);
  const entries = await readdir(folder, { withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

/** The messages for change `id` that nobody took are gone: nobody will take them now. */
export async function dropMessages(git: Git, id: string): Promise<void> {
  await remove(join(await git.gitPath(MESSAGES), id));
}

/**
 * Takes the messages waiting for the session of change `id`, in the order they came: each is
 * removed as it is read, and one another process removed first is that one's.
 */
export async function takeMessages(git: Git, id: string): Promise<MessageView[]> {
  const folder = join(await git.gitPath(MESSAGES), id);
  const names = (await readdir(folder).catch(() => [])).filter((name) => name.endsWith(".json"));
  const taken: MessageView[] = [];
  for (const name of names.sort()) {
    const path = join(folder, name);
    const message = messageOf(parseJson(await readText(path)));
    const mine = await unlink(path).then(
      () => true,
      () => false,
    );
    if (mine && message !== undefined) taken.push(message);
  }
  // An empty folder goes, so that the next look finds nothing; one just written to stays.
  await rmdir(folder).catch(() => undefined);
  return taken;
}

function messageOf(value: unknown): MessageView | undefined {
  if (!isRecord(value) || !isRecord(value.from)) return undefined;
  const { at, text } = value;
  const { actor, tool, change, folder } = value.from;
  if (typeof at !== "string" || typeof text !== "string" || typeof folder !== "string")
    return undefined;
  if (actor !== "agent" && actor !== "human") return undefined;
  return {
    at,
    text,
    from: {
      actor,
      ...(typeof tool === "string" ? { tool } : {}),
      ...(typeof change === "string" ? { change } : {}),
      folder,
    },
  };
}
