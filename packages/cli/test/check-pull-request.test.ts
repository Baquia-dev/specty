// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { CONFIG, cli, git, tempRepo, writeFiles } from "./support";

// The marker is put together from parts, so that this file does not trip `specty check`.
const TODO = "TODO";

/** A pull request as GitHub Actions checks it out: HEAD detached on the PR merged into main. */
async function pullRequest(): Promise<string> {
  const root = await tempRepo({
    "src/old.ts": `// ${TODO}: from before the PR\nexport const old = 1;\n`,
    ".specty/config.yaml": `${CONFIG()}checks:\n  levels: { secrets: off }\n`,
  });
  git(root, "switch", "-q", "-c", "feature");
  await writeFiles(root, {
    "src/new.ts": `// ${TODO}: added by the PR\nexport const added = 2;\n`,
  });
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "feature");
  git(root, "switch", "-q", "--detach", "main");
  git(root, "merge", "-q", "--no-ff", "-m", "Merge feature", "feature");
  git(root, "branch", "-q", "-D", "feature");
  return root;
}

describe("specty check --changed in a pull request", () => {
  it("compares with the local main: it sees what the PR adds, not what was there (AC2)", async () => {
    const root = await pullRequest();
    const run = await cli(root, ["check", "--changed"]);
    expect(run.code).toBe(1);
    expect(run.out).toContain(`FALLA todo\n  src/new.ts:1 ${TODO} sin referencia a un issue`);
    expect(run.out).not.toContain("src/old.ts");
  });

  it("sees nothing without a local main, which is why the CI job creates one", async () => {
    const root = await pullRequest();
    git(root, "branch", "-q", "-D", "main");
    const run = await cli(root, ["check", "--changed"]);
    expect(run.code).toBe(0);
    expect(run.out).not.toContain("src/new.ts");
  });
});
