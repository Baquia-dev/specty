// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { installFiles } from "../src/install/files";
import { exists } from "../src/io/files";

const folder = () => mkdtemp(join(tmpdir(), "specty-files-"));

describe("how the installers write", () => {
  it("plans without touching the disk, and reads what it planned", async () => {
    const root = await folder();
    await writeFile(join(root, "kept.md"), "old\n");
    const files = installFiles({ dryRun: true });
    await files.write(join(root, "kept.md"), "new\n");
    await files.write(join(root, "added.md"), "x\n", { executable: true });
    await files.write(join(root, "added.md"), "x\n");
    expect(await files.read(join(root, "kept.md"))).toBe("new\n");
    expect(await readFile(join(root, "kept.md"), "utf8")).toBe("old\n");
    expect(await exists(join(root, "added.md"))).toBe(false);
    expect(files.changes).toEqual([
      { path: join(root, "kept.md"), created: false },
      { path: join(root, "added.md"), created: true },
    ]);
  });

  it("records only real changes, and makes a file runnable when asked", async () => {
    const root = await folder();
    await writeFile(join(root, "same.md"), "same\n");
    const files = installFiles();
    await files.write(join(root, "same.md"), "same\n");
    await files.write(join(root, "hook"), "#!/bin/sh\n", { executable: true });
    expect(files.changes).toEqual([{ path: join(root, "hook"), created: true }]);
    expect((await stat(join(root, "hook"))).mode & 0o111).toBe(0o111);
  });

  it("keeps a copy of each existing file before it changes, with a manifest", async () => {
    const root = await folder();
    const outside = await folder();
    const backups = join(await folder(), "backups");
    await writeFile(join(root, "AGENTS.md"), "mine\n");
    await writeFile(join(outside, "hooks.json"), "{}\n");
    const files = installFiles({ backups: { folder: backups, root } });
    await files.write(join(root, "CLAUDE.md"), "@AGENTS.md\n");
    await files.write(join(root, "AGENTS.md"), "mine\nspecty\n");
    await files.write(join(root, "AGENTS.md"), "mine\nspecty again\n");
    await files.write(join(outside, "hooks.json"), '{"hooks":{}}\n');
    expect(await readFile(join(backups, "repo/AGENTS.md"), "utf8")).toBe("mine\n");
    const copy = `outside${join(outside, "hooks.json")}`;
    expect(await readFile(join(backups, copy), "utf8")).toBe("{}\n");
    expect(JSON.parse(await readFile(join(backups, "manifest.json"), "utf8"))).toEqual([
      { path: join(root, "CLAUDE.md"), created: true },
      { path: join(root, "AGENTS.md"), created: false, copy: "repo/AGENTS.md" },
      { path: join(outside, "hooks.json"), created: false, copy },
    ]);
    expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe("mine\nspecty again\n");
  });

  it("makes no copies folder when every file it writes is new", async () => {
    const root = await folder();
    const backups = join(await folder(), "backups");
    const files = installFiles({ backups: { folder: backups, root } });
    await files.write(join(root, "new.md"), "x\n");
    expect(await exists(backups)).toBe(false);
    expect(installFiles({ dryRun: true, backups: { folder: backups, root } }).changes).toEqual([]);
  });

  it("deletes files, planned or for real, keeping a copy of each", async () => {
    const root = await folder();
    const backups = join(await folder(), "backups");
    await writeFile(join(root, "hook"), "#!/bin/sh\n");
    const planned = installFiles({ dryRun: true });
    await planned.remove(join(root, "hook"));
    await planned.remove(join(root, "missing"));
    expect(await planned.read(join(root, "hook"))).toBeUndefined();
    expect(await exists(join(root, "hook"))).toBe(true);
    expect(planned.changes).toEqual([{ path: join(root, "hook"), created: false, removed: true }]);
    const files = installFiles({ backups: { folder: backups, root } });
    await files.remove(join(root, "hook"));
    expect(await exists(join(root, "hook"))).toBe(false);
    expect(await readFile(join(backups, "repo/hook"), "utf8")).toBe("#!/bin/sh\n");
    expect(JSON.parse(await readFile(join(backups, "manifest.json"), "utf8"))).toEqual([
      { path: join(root, "hook"), created: false, removed: true, copy: "repo/hook" },
    ]);
  });
});
