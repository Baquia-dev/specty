// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import {
  type ChangedFile,
  isGoverned,
  type LongFile,
  longFiles,
  type SizedFile,
} from "@baquia-dev/specty-core";
import { readText } from "../io/files";
import type { Session } from "../session";

/**
 * The governed files the task created or modified that it left too long: each one as it is now
 * and as it was at the task's base commit, so only what the task did counts against it.
 */
export async function longFilesOf(
  session: Session,
  base: string | undefined,
  changed: readonly ChangedFile[],
): Promise<readonly LongFile[]> {
  const touched = changed.filter(
    (file) =>
      file.status !== "deleted" &&
      !file.path.startsWith(".specty/") &&
      isGoverned(file.path, session.config),
  );
  const files = await Promise.all(
    touched.map(async (file): Promise<SizedFile[]> => {
      const after = await readText(join(session.root, file.path));
      if (after === undefined) return [];
      const before =
        base === undefined || file.status === "added"
          ? undefined
          : await shown(session, base, file.from ?? file.path);
      return [{ path: file.path, after, ...(before !== undefined ? { before } : {}) }];
    }),
  );
  return longFiles(files.flat(), session.config);
}

/** The file's text at `commit`, or undefined when it did not exist there. */
async function shown(session: Session, commit: string, path: string): Promise<string | undefined> {
  const result = await session.git.run(["--literal-pathspecs", "show", `${commit}:${path}`]);
  return result.code === 0 ? result.stdout : undefined;
}
