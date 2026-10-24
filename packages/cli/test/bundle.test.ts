// SPDX-License-Identifier: Apache-2.0
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { get } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import { APP, tempRepo, testEnv } from "./support";

const PACKAGE = join(import.meta.dirname, "..");

/** Runs the CLI's build into `out`, as `pnpm build` and `prepack` do. */
const bundle = (out: string, ...args: string[]) =>
  execFileSync(process.execPath, ["build.mjs", "--outdir", out, ...args], {
    cwd: PACKAGE,
    encoding: "utf8",
    stdio: "pipe",
  });

/** The page the server gives for `/`, asked as the browser would (`Host: localhost:<port>`). */
const page = (port: number) =>
  new Promise<string>((done, fail) => {
    const request = get(
      { host: "127.0.0.1", port, path: "/", headers: { host: `localhost:${port}` } },
      (response) => {
        let body = "";
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => done(body));
      },
    );
    request.on("error", fail);
  });

/** Starts `specty ui` from the bundle in `out` and gives the port it prints. */
function serve(out: string, cwd: string) {
  const child = spawn(process.execPath, [join(out, "specty.mjs"), "ui", "--port", "0"], {
    cwd,
    env: testEnv(),
  });
  const port = new Promise<number>((done, fail) => {
    let text = "";
    child.stdout.on("data", (chunk) => {
      text += chunk;
      const found = /http:\/\/localhost:(\d+)\//.exec(text);
      if (found !== null) done(Number(found[1]));
    });
    child.on("exit", () => fail(new Error(`specty ui exited: ${text}`)));
  });
  return { port, stop: () => child.kill() };
}

describe("the CLI bundle", () => {
  it("carries the UI when packed, serves it, and leaves no copy otherwise", async () => {
    const out = await mkdtemp(join(tmpdir(), "specty-bundle-"));
    const built = await mkdtemp(join(tmpdir(), "specty-ui-"));
    await writeFile(
      join(built, "index.html"),
      "<html><head><title>UI empaquetada</title></head></html>",
    );
    await mkdir(join(built, "media"));
    await writeFile(join(built, "media", "font.woff2"), "font\n");
    bundle(out, "--ui", built);
    expect(await readFile(join(out, "ui", "media", "font.woff2"), "utf8")).toBe("font\n");
    const server = serve(out, await tempRepo(APP));
    try {
      expect(await page(await server.port)).toContain("<title>UI empaquetada</title>");
    } finally {
      server.stop();
    }
    // A plain build drops the copy, so `specty ui` goes back to the monorepo's own build.
    bundle(out);
    expect(await exists(join(out, "specty.mjs"))).toBe(true);
    expect(await exists(join(out, "ui"))).toBe(false);
  });

  it("refuses to pack a folder that is not a UI build", async () => {
    const out = await mkdtemp(join(tmpdir(), "specty-bundle-"));
    const empty = await mkdtemp(join(tmpdir(), "specty-ui-"));
    expect(() => bundle(out, "--ui", empty)).toThrow(`build: ${empty} has no index.html`);
    expect(await exists(join(out, "ui"))).toBe(false);
  });

  it("lets the hooks load none of the rest of the CLI, from this build's chunks only (AC1, AC2, AC4)", async () => {
    const out = await mkdtemp(join(tmpdir(), "specty-bundle-"));
    const metafile = join(await mkdtemp(join(tmpdir(), "specty-meta-")), "meta.json");
    await writeFile(join(out, "chunk-OLD.mjs"), "");
    bundle(out, "--metafile", metafile);
    expect(await exists(join(out, "chunk-OLD.mjs"))).toBe(false);
    const { outputs }: Metafile = JSON.parse(await readFile(metafile, "utf8"));
    const named = Object.entries(outputs);
    const main = named.find(([, output]) => output.entryPoint === "src/main.ts")?.[0];
    const hooks = named.find(([, output]) => Object.hasOwn(output.inputs, "src/enforce/entry.ts"));
    const inputs = loaded(outputs, [main, hooks?.[0]]).flatMap((path) =>
      Object.keys(outputs[path]?.inputs ?? {}),
    );
    expect(inputs).toContain("src/enforce/guard.ts");
    for (const heavy of [
      "/commander/",
      "/@clack/",
      "src/program.ts",
      "src/server/",
      "src/commands/init.ts",
    ]) {
      expect(
        inputs.filter((input) => input.includes(heavy)),
        heavy,
      ).toEqual([]);
    }
    const everything = named.flatMap(([, output]) => Object.keys(output.inputs));
    const translations = everything.filter((input) => /zod\/v4\/locales\/(?!en\.js)/.test(input));
    expect(translations).toEqual([]);
    // The split bundle still answers the hooks and every other command.
    const plain = await mkdtemp(join(tmpdir(), "specty-plain-"));
    const event = JSON.stringify({ cwd: plain, tool_name: "Bash", tool_input: { command: "ls" } });
    const cli = join(out, "specty.mjs");
    const allowed = spawnSync(process.execPath, [cli, "guard", "--tool", "claude-code"], {
      input: event,
      encoding: "utf8",
    });
    expect([allowed.status, allowed.stderr]).toEqual([0, ""]);
    expect(execFileSync(process.execPath, [cli, "--help"], { encoding: "utf8" })).toContain(
      "Usage: specty",
    );
  });
});

/** What a build's metafile says about each output file. */
interface Metafile {
  readonly outputs: Record<
    string,
    {
      readonly entryPoint?: string;
      readonly inputs: Record<string, unknown>;
      readonly imports: readonly { readonly path: string; readonly kind: string }[];
    }
  >;
}

/** The outputs a run loads from `starts`: those, and what they import statically. */
function loaded(outputs: Metafile["outputs"], starts: readonly (string | undefined)[]): string[] {
  const seen = new Set<string>();
  const visit = (path: string | undefined) => {
    const output = path === undefined ? undefined : outputs[path];
    if (path === undefined || output === undefined || seen.has(path)) return;
    seen.add(path);
    for (const used of output.imports) if (used.kind === "import-statement") visit(used.path);
  };
  for (const start of starts) visit(start);
  return [...seen];
}
