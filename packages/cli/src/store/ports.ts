// SPDX-License-Identifier: Apache-2.0
import { realpath } from "node:fs/promises";
import { exists, isRecord, parseJson, readText, writeText } from "../io/files";
import type { Session } from "../session";

/**
 * The place of each change's folder among the development ports (formats.md §1): a file shared by
 * every worktree, `{ "<folder>": <place> }`. Under `common/`, git keeps it in the common directory.
 */
const PORTS = "common/specty/ports.json";

/**
 * The development ports of `folder`: `dev.ports` plus the folder's place, which it keeps while it
 * exists; a new folder takes the lowest free place from 1, and a folder that no longer exists
 * frees its own. None without `dev.ports`, or in the main folder, which uses them as they are.
 */
export async function portsOf(session: Session, folder: string): Promise<readonly number[]> {
  const { ports } = session.config.dev;
  if (ports.length === 0) return [];
  const here = await real(folder);
  const main = (await session.git.worktrees())[0]?.folder;
  if (main === undefined || (await real(main)) === here) return [];
  const path = await session.git.gitPath(PORTS);
  const read = placesOf(parseJson(await readText(path)));
  const places = await living(read);
  const known = places.get(here);
  const place = known ?? lowestFree(new Set(places.values()));
  // Written when the folder takes its place or a folder that is gone frees one.
  if (known === undefined || places.size !== read.size) {
    const kept = Object.fromEntries([...places, [here, place]]);
    await writeText(path, `${JSON.stringify(kept, null, 2)}\n`);
  }
  return ports.map((port) => port + place);
}

/** The places in the file, by folder; nothing that is not a folder with a whole place. */
function placesOf(value: unknown): ReadonlyMap<string, number> {
  if (!isRecord(value)) return new Map();
  return new Map(
    Object.entries(value).flatMap(([folder, place]) =>
      typeof place === "number" && Number.isInteger(place) && place > 0 ? [[folder, place]] : [],
    ),
  );
}

/** The places of the folders that still exist: the others are free again. */
async function living(places: ReadonlyMap<string, number>): Promise<Map<string, number>> {
  const kept = await Promise.all(
    [...places].map(
      async ([folder, place]): Promise<[string, number][]> =>
        (await exists(folder)) ? [[folder, place]] : [],
    ),
  );
  return new Map(kept.flat());
}

/** The lowest place from 1 that no folder holds. */
function lowestFree(used: ReadonlySet<number>): number {
  let place = 1;
  while (used.has(place)) place++;
  return place;
}

/** The real path of `folder`, or `folder` itself when it does not exist. */
async function real(folder: string): Promise<string> {
  return realpath(folder).catch(() => folder);
}
