// SPDX-License-Identifier: Apache-2.0
import { stat } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { join } from "node:path";
import type { Session } from "../session";
import { listDir } from "../store/changes";
import { readDelegation } from "../store/local";
import { repoPaths } from "../store/paths";

/** The files of an open change whose time and size say it moved. */
const WATCHED: readonly string[] = ["spec.md", "state.json", "audit.jsonl", "comments.json"];

/**
 * What the changes look like on disk: the open changes of each worktree, by their files' time and
 * size, the name of every archived change, and the delegated mode switch. The same fingerprint
 * means the same data.
 */
export async function fingerprint(session: Session): Promise<string> {
  const parts: string[] = [`delegated ${JSON.stringify(await readDelegation(session.git))}`];
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
  /** Tells every listener `event`, with `data` as JSON. */
  send(event: string, data: unknown): void;
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
  const tell = (listener: ServerResponse) => listener.write("event: changes\ndata: {}\n\n");
  const watch = fingerprintWatch(session, interval, () => listeners.forEach(tell));
  return {
    add(response) {
      response.writeHead(200, { ...headers, "Content-Type": "text/event-stream" });
      listeners.add(response);
      response.on("close", () => {
        listeners.delete(response);
        if (listeners.size === 0) watch.stop();
      });
      // It hears `changes` once the first look is done: whatever it reads then is in that look,
      // so anything that moves later is heard, however slow the look was.
      void watch.start().then(() => {
        if (listeners.has(response)) tell(response);
      });
    },
    send(event, data) {
      const text = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      for (const listener of listeners) listener.write(text);
    },
    close() {
      watch.stop();
      for (const listener of listeners) listener.end();
      listeners.clear();
    },
  };
}

/** The fingerprint looked at every `interval` while started; `moved` hears when it changes. */
interface Watch {
  /** Starts looking, unless it already does; resolves once the first look is done. */
  start(): Promise<void>;
  /** Stops looking and forgets the last fingerprint. */
  stop(): void;
}

function fingerprintWatch(session: Session, interval: number, moved: () => void): Watch {
  let timer: NodeJS.Timeout | undefined;
  let last: string | undefined;
  let looking = false;
  const look = async () => {
    if (looking) return;
    looking = true;
    try {
      const now = await fingerprint(session);
      if (last !== undefined && now !== last) moved();
      last = now;
    } catch {
      // A failed look waits for the next one.
    } finally {
      looking = false;
    }
  };
  /** The first look while someone listens: until it is done, nothing can tell what moved. */
  let ready: Promise<void> | undefined;
  return {
    start() {
      ready ??= look();
      timer ??= setInterval(() => void look(), interval);
      return ready;
    },
    stop() {
      clearInterval(timer);
      timer = undefined;
      last = undefined;
      ready = undefined;
    },
  };
}
