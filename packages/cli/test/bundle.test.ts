// SPDX-License-Identifier: Apache-2.0
import { execFileSync, spawn } from "node:child_process";
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
});
