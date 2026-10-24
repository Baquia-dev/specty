// SPDX-License-Identifier: Apache-2.0
import { stat } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { join } from "node:path";
import type { Session } from "../session";
import { listDir } from "../store/changes";
import { repoPaths } from "../store/paths";

/** The files of an open change whose time and size say it moved. */
const WATCHED: readonly string[] = ["spec.md", "state.json", "audit.jsonl", "comments.json"];

/**
 * What the changes look like on disk: the open changes of each worktree, by their files' time and
 * size, and the name of every archived change. The same fingerprint means the same data.
 */
export async function fingerprint(session: Session): Promise<string> {
  const parts: string[] = [];
  for (const { folder } of await session.git.worktrees()) {
    const { changes, archive } = repoPaths(folder);
    for (const id of await listDir(changes)) {
      for (const name of WATCHED) {
        const info = await stat(join(changes, id, name)).catch(() => undefined);
        parts.push(`${folder}/${id}/${name} ${info?.mtimeMs ?? "-"} ${info?.size ?? "-"}`);
      }
    }
    for (const year of await listDir(archive)) {
      for (const id of await listDir(join(archive, year))) parts.push(`${folder} archive ${id}`);
    }
  }
  return parts.join("\n");
}

export interface ChangeEvents {
  /** Turns `response` into an event stream that hears `changes`, once at the start. */
  add(response: ServerResponse): void;
  close(): void;
}

/**
 * Server-sent events: each listener hears `changes` when it connects and whenever the fingerprint
 * moves. The changes are only looked at while someone listens.
 */
export function changeEvents(
  session: Session,
  interval: number,
  headers: Readonly<Record<string, string>>,
): ChangeEvents {
  const listeners = new Set<ServerResponse>();
  let timer: NodeJS.Timeout | undefined;
  let last: string | undefined;
  let looking = false;
  const tell = (listener: ServerResponse) => listener.write("event: changes\ndata: {}\n\n");
  const look = async () => {
    if (looking) return;
    looking = true;
    try {
      const now = await fingerprint(session);
      if (last !== undefined && now !== last) listeners.forEach(tell);
      last = now;
    } catch {
      // A failed look waits for the next one.
    } finally {
      looking = false;
    }
  };
  const stop = () => {
    clearInterval(timer);
    timer = undefined;
    last = undefined;
  };
  return {
    add(response) {
      response.writeHead(200, { ...headers, "Content-Type": "text/event-stream" });
      tell(response);
      listeners.add(response);
      response.on("close", () => {
        listeners.delete(response);
        if (listeners.size === 0) stop();
      });
      if (timer === undefined) {
        void look();
        timer = setInterval(() => void look(), interval);
      }
    },
    close() {
      stop();
      for (const listener of listeners) listener.end();
      listeners.clear();
    },
  };
}
