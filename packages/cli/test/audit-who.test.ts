// SPDX-License-Identifier: Apache-2.0
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP, CHANGE, cli, person, SPEC, SPEC_PATH, tempRepo, writeFiles } from "./support";

type Line = Record<string, unknown> & { readonly event: string };

async function auditOf(root: string): Promise<Line[]> {
  const text = await readFile(join(root, ".specty", "changes", CHANGE, "audit.jsonl"), "utf8");
  return text
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

/** A repository with SPEC's change proposed by the agent, waiting for its review. */
async function inReview(env: Record<string, string> = {}): Promise<string> {
  const root = await tempRepo(APP);
  expect((await cli(root, ["new", "Saludo personalizado"], { env })).code).toBe(0);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  expect((await cli(root, ["propose"], { env })).code).toBe(0);
  return root;
}

/** Claude Code's folder with a session's transcript: its answers, the last ones at the end. */
async function claudeFolder(session: string, lines: readonly unknown[]): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), "claude-config-"));
  const project = join(folder, "projects", "-Users-ana-repo");
  await mkdir(project, { recursive: true });
  await writeFile(
    join(project, `${session}.jsonl`),
    `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`,
  );
  return folder;
}

describe("who is behind each line of the audit", () => {
  it("AC1: a person's decision carries their git name, and so does the agent's on their behalf", async () => {
    const root = await inReview();
    await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
    const lines = await auditOf(root);
    expect(lines.find((line) => line.event === "spec.approved")).toMatchObject({
      actor: "human",
      by: "Ana",
    });
    expect(lines.find((line) => line.event === "spec.proposed")).not.toHaveProperty("by");

    const delegated = await tempRepo(APP);
    await cli(delegated, ["delegate", "on"], { terminal: person({ choose: ["yes"] }) });
    expect((await cli(delegated, ["new", "Saludo personalizado"])).code).toBe(0);
    await writeFiles(delegated, { [SPEC_PATH]: SPEC });
    await cli(delegated, ["propose"]);
    expect((await cli(delegated, ["approve"])).code).toBe(0);
    expect((await auditOf(delegated)).find((line) => line.event === "spec.approved")).toMatchObject(
      { actor: "agent", by: "Ana", data: expect.objectContaining({ delegated: true }) },
    );
  });

  it("AC2: Claude Code's lines carry its effort and the model of its session's last answer", async () => {
    const folder = await claudeFolder("sesion-1", [
      { type: "assistant", message: { model: "claude-sonnet-5-5", content: [] } },
      { type: "user", message: { content: "sigue" } },
      { type: "assistant", message: { model: "claude-opus-5-5", content: [] }, effort: "high" },
      { type: "assistant", message: { model: "<synthetic>", content: [] } },
    ]);
    const env = {
      CLAUDECODE: "1",
      CLAUDE_EFFORT: "high",
      CLAUDE_CODE_SESSION_ID: "sesion-1",
      CLAUDE_CONFIG_DIR: folder,
    };
    const root = await inReview(env);
    const created = (await auditOf(root)).find((line) => line.event === "change.created");
    expect(created).toMatchObject({
      actor: "agent",
      tool: "claude-code",
      model: "claude-opus-5-5",
      effort: "high",
    });
  });

  it("AC2: goes without what it cannot find, and never reads a path out of the session's id", async () => {
    const folder = await claudeFolder("sesion-1", [
      { type: "assistant", message: { model: "claude-opus-5-5", content: [] } },
    ]);
    const unknown = await inReview({
      CLAUDECODE: "1",
      CLAUDE_EFFORT: "medium",
      CLAUDE_CODE_SESSION_ID: "otra-sesion",
      CLAUDE_CONFIG_DIR: folder,
    });
    const created = (await auditOf(unknown)).find((line) => line.event === "change.created");
    expect(created).toMatchObject({ tool: "claude-code", effort: "medium" });
    expect(created).not.toHaveProperty("model");

    const crooked = await inReview({
      CLAUDECODE: "1",
      CLAUDE_CODE_SESSION_ID: "../-Users-ana-repo/sesion-1",
      CLAUDE_CONFIG_DIR: folder,
    });
    const line = (await auditOf(crooked)).find((entry) => entry.event === "change.created");
    expect(line).not.toHaveProperty("model");
    expect(line).not.toHaveProperty("effort");

    // Without Claude Code, its variables say nothing.
    const other = await inReview({ CLAUDE_EFFORT: "high", CLAUDE_CODE_SESSION_ID: "sesion-1" });
    const plain = (await auditOf(other)).find((entry) => entry.event === "spec.proposed");
    expect(plain).not.toHaveProperty("effort");
    expect(plain).not.toHaveProperty("model");
  });
});
