// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP } from "../support";
import { call, implemented, path, serving } from "./support";

/** The line `src/app.ts` starts with, from the repository's first commit, outside Specty. */
const BASE = APP["src/app.ts"].trimEnd();
const GREET = "export const greet = (name: string) => 'Hola, ' + name;";
const BYE = "export const bye = 1;";
const HEADER = "// Saludos";

describe("the lines of a block in its task's commit", () => {
  it("AC1: gives each block the numbers its lines had in its task's commit, even after a later task moved them", async () => {
    const { root, server, headers } = await serving();
    try {
      // T2 puts a header on top: T1's line moves from 2 to 3, but it was 2 in T1's commit.
      await implemented(root, `${BASE}\n${GREET}\n`, `${HEADER}\n${BASE}\n${GREET}\n${BYE}\n`);
      const answer = await call(server.port, `${path("trace")}?path=src/app.ts`, headers);
      const traced = JSON.parse(answer.body);
      expect(traced.lines).toEqual([HEADER, BASE, GREET, BYE]);
      interface Block {
        readonly start: number;
        readonly end: number;
        readonly origin: unknown;
        readonly commit: { readonly change?: { readonly task?: { readonly id: string } } };
      }
      const blocks: readonly Block[] = traced.blocks;
      expect(
        blocks.map(({ start, end, origin, commit }) => ({
          start,
          end,
          task: commit.change?.task?.id,
          origin,
        })),
      ).toEqual([
        { start: 1, end: 1, task: "T2", origin: [1] },
        { start: 2, end: 2, task: undefined, origin: [1] },
        { start: 3, end: 3, task: "T1", origin: [2] },
        { start: 4, end: 4, task: "T2", origin: [4] },
      ]);
    } finally {
      await server.close();
    }
  });
});
