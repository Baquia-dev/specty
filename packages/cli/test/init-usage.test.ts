// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { describe, expect, it } from "vitest";
import { cli, git, person, tempRepo, writeFiles } from "./support";

/** A Node project managed by pnpm, as init detects it. */
const NODE = {
  "package.json": '{"name":"demo","scripts":{"test":"true"}}\n',
  "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
};
const ADDED =
  "ccusage añadido como dependencia de desarrollo: al cerrar cada cambio, Specty dice lo que consumió.";
const INIT = ["init", "--language", "es", "--tools", "claude-code"];

/**
 * A `pnpm` first on the PATH that writes down its arguments and adds ccusage to `package.json`,
 * or fails: the PATH to give init, and what it was called with.
 */
async function fakePnpm(fails = false) {
  const bin = await mkdtemp(join(tmpdir(), "fake-pnpm-"));
  const log = join(bin, "calls.log");
  const script = [
    "#!/usr/bin/env node",
    'const fs = require("node:fs");',
    `fs.appendFileSync(${JSON.stringify(log)}, process.argv.slice(2).join(" ") + "\\n");`,
    `if (${fails}) process.exit(1);`,
    'const json = JSON.parse(fs.readFileSync("package.json", "utf8"));',
    'json.devDependencies = { ...json.devDependencies, ccusage: "20.0.45" };',
    'fs.writeFileSync("package.json", JSON.stringify(json, null, 2) + "\\n");',
  ].join("\n");
  await writeFile(join(bin, "pnpm"), `${script}\n`);
  await chmod(join(bin, "pnpm"), 0o755);
  return {
    env: { PATH: `${bin}${delimiter}${process.env.PATH ?? ""}` },
    calls: async () => (await readFile(log, "utf8").catch(() => "")).trim(),
  };
}

describe("init's offer of ccusage", () => {
  it("AC1: a person who accepts gets it as a development dependency, in init's commit", async () => {
    const pnpm = await fakePnpm();
    const root = await tempRepo(NODE);
    const out = (await cli(root, INIT, { terminal: person(), env: pnpm.env })).out;
    expect(await pnpm.calls()).toBe("add -D ccusage@20.0.45");
    expect(out).toContain(ADDED);
    expect(git(root, "show", "--name-only", "--format=", "HEAD")).toContain("package.json");
    // At the root of a pnpm workspace, with `-w`.
    const workspace = await fakePnpm();
    const monorepo = await tempRepo({
      ...NODE,
      "pnpm-workspace.yaml": "packages:\n  - packages/*\n",
    });
    await cli(monorepo, INIT, { terminal: person(), env: workspace.env });
    expect(await workspace.calls()).toBe("add -D -w ccusage@20.0.45");
  });

  it("AC2: nothing is installed when the person declines; a failure leaves the command", async () => {
    const declined = await fakePnpm();
    const root = await tempRepo(NODE);
    const out = (
      await cli(root, INIT, { terminal: person({ confirm: [false] }), env: declined.env })
    ).out;
    expect(await declined.calls()).toBe("");
    expect(out).not.toContain(ADDED);
    const failing = await fakePnpm(true);
    const broken = await tempRepo(NODE);
    const said = (await cli(broken, INIT, { terminal: person(), env: failing.env })).out;
    expect(said).toContain(
      "No se pudo añadir ccusage: ejecuta `pnpm add -D ccusage@20.0.45` para que Specty mida el consumo de cada cambio.",
    );
    expect(said).not.toContain(ADDED);
  });

  it("AC3: an agent, or a project that is not Node's, gets how to install it", async () => {
    const pnpm = await fakePnpm();
    const root = await tempRepo(NODE);
    const out = (await cli(root, INIT, { env: pnpm.env })).out;
    expect(await pnpm.calls()).toBe("");
    expect(out).toContain(
      "Para que Specty mida el consumo de cada cambio, instala ccusage: `pnpm add -D ccusage@20.0.45`.",
    );
    const flutter = await tempRepo({ "pubspec.yaml": "name: demo\n" });
    const said = (await cli(flutter, INIT, { terminal: person() })).out;
    expect(said).toContain(
      "Para que Specty mida el consumo de cada cambio, instala ccusage: `npm i -g ccusage@20.0.45`.",
    );
  });

  it("AC4: says nothing when ccusage is there, the configuration existed, or with --dry-run", async () => {
    const pnpm = await fakePnpm();
    const has = await tempRepo({
      ...NODE,
      "package.json": '{"name":"demo","devDependencies":{"ccusage":"20.0.45"}}\n',
    });
    expect((await cli(has, INIT, { terminal: person(), env: pnpm.env })).out).not.toContain(
      "ccusage",
    );
    const again = await tempRepo(NODE);
    await cli(again, INIT, { env: pnpm.env });
    expect((await cli(again, INIT, { terminal: person(), env: pnpm.env })).out).not.toContain(
      "ccusage",
    );
    const dry = await tempRepo(NODE);
    const planned = await cli(dry, [...INIT, "--dry-run"], { terminal: person(), env: pnpm.env });
    expect(planned.out).not.toContain("ccusage");
    expect(await pnpm.calls()).toBe("");
  });
});

/** The PATH without the folders that have a ccusage, as on a machine that never installed it. */
function pathWithoutCcusage(): string {
  return (process.env.PATH ?? "")
    .split(delimiter)
    .filter((dir) => !existsSync(join(dir, "ccusage")))
    .join(delimiter);
}

describe("doctor's warning about ccusage", () => {
  const WARNING =
    "Falta ccusage, así que al cerrar cada cambio Specty no dice lo que consumió. Para instalarlo:";

  it("a configured project without ccusage gets how to install it, without turning red", async () => {
    const env = { PATH: pathWithoutCcusage() };
    const root = await tempRepo(NODE);
    await cli(root, INIT, { env });
    const warned = await cli(root, ["doctor"], { env });
    expect(warned.out).toContain(`${WARNING} \`pnpm add -D ccusage@20.0.45\`.`);
    // The ccusage closing runs: the project's, in `node_modules/.bin`.
    await writeFiles(root, { "node_modules/.bin/ccusage": "#!/bin/sh\n" });
    const local = await cli(root, ["doctor"], { env });
    expect(local.out).not.toContain(WARNING);
    expect(warned.code).toBe(local.code);
    // Outside Node, the one for the whole system.
    const flutter = await tempRepo({ "pubspec.yaml": "name: demo\n" });
    await cli(flutter, INIT, { env });
    expect((await cli(flutter, ["doctor"], { env })).out).toContain(
      `${WARNING} \`npm i -g ccusage@20.0.45\`.`,
    );
  });

  it("says nothing when ccusage is on the PATH", async () => {
    const bin = await mkdtemp(join(tmpdir(), "ccusage-bin-"));
    await writeFile(join(bin, "ccusage"), "#!/bin/sh\n");
    await chmod(join(bin, "ccusage"), 0o755);
    const env = { PATH: `${bin}${delimiter}${pathWithoutCcusage()}` };
    const root = await tempRepo(NODE);
    await cli(root, INIT, { env });
    expect((await cli(root, ["doctor"], { env })).out).not.toContain(WARNING);
  });
});
