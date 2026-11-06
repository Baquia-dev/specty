// SPDX-License-Identifier: Apache-2.0
// A change whose folder goes while the server reads it, as when it is archived or its worktree
// removed: `io/files` is wrapped so the folder goes at a known step, so this file is apart.
import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CHANGE } from "../support";
import { call, serving } from "./support";

/** The file whose first read, after it is answered, removes its change's folder. */
const vanish = vi.hoisted(() => ({ after: undefined as string | undefined }));

vi.mock("../../src/io/files", async (importOriginal) => {
  const files = await importOriginal<typeof import("../../src/io/files")>();
  const then =
    <T>(read: (path: string) => Promise<T>) =>
    async (path: string): Promise<T> => {
      const answer = await read(path);
      const after = vanish.after;
      if (after !== undefined && path.endsWith(after)) {
        vanish.after = undefined;
        await rm(dirname(path), { recursive: true, force: true });
      }
      return answer;
    };
  return { ...files, exists: then(files.exists), readText: then(files.readText) };
});

const OWN = join(".specty", "changes", CHANGE);

describe("the changes the server lists while one's folder goes", () => {
  it("AC2: answers 200 without a change whose folder goes once its state is found", async () => {
    const { server, headers } = await serving();
    try {
      vanish.after = join(OWN, "state.json");
      const listed = await call(server.port, "/api/changes", headers);
      expect(vanish.after).toBeUndefined();
      expect([listed.status, listed.body]).toEqual([200, "[]"]);
    } finally {
      await server.close();
    }
  });

  it("AC2: answers 200 without a change whose folder goes once its spec is read", async () => {
    const { server, headers } = await serving();
    try {
      vanish.after = join(OWN, "spec.md");
      const listed = await call(server.port, "/api/changes", headers);
      expect(vanish.after).toBeUndefined();
      expect([listed.status, listed.body]).toEqual([200, "[]"]);
    } finally {
      await server.close();
    }
  });
});
