// SPDX-License-Identifier: Apache-2.0
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const CLI = fileURLToPath(new URL("..", import.meta.url));

/** A build of the UI as Angular writes it, in miniature: an entry, a lazy chunk, styles and a font. */
const UI_BUILD: Readonly<Record<string, string>> = {
  "index.html": [
    "<!doctype html>",
    '<html lang="es">',
    "<head>",
    '<meta charset="utf-8">',
    "<title>Specty</title>",
    '<base href="/">',
    '<link rel="stylesheet" href="styles-ABC.css">',
    '<link rel="modulepreload" href="chunk-1.js">',
    "</head>",
    "<body><sp-root></sp-root>",
    '<script src="main-XYZ.js" type="module"></script>',
    "</body>",
    "</html>",
    "",
  ].join("\n"),
  "main-XYZ.js":
    'import("./chunk-1.js").then((chunk) => { document.body.dataset.loaded = chunk.value; });\n',
  "chunk-1.js": 'export const value = "chunk-loaded";\n',
  "styles-ABC.css":
    '@font-face{font-family:Geist;src:url(media/geist.woff2) format("woff2")}body{color:rebeccapurple}\n',
  "media/geist.woff2": "font",
};

describe("the page of the MCP App", () => {
  it("AC5: the CLI's build writes one HTML with everything inside, the mark, and no base or fonts", async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "specty-page-")));
    const ui = join(root, "ui");
    await mkdir(join(ui, "media"), { recursive: true });
    for (const [path, text] of Object.entries(UI_BUILD)) await writeFile(join(ui, path), text);
    const out = join(root, "out");
    await promisify(execFile)(process.execPath, ["build.mjs", "--ui", ui, "--outdir", out], {
      cwd: CLI,
    });
    const html = await readFile(join(out, "mcp-app.html"), "utf8");
    expect(html).toContain('<meta name="specty-data" content="mcp-app">');
    expect(html).toContain("rebeccapurple");
    expect(html).toContain("chunk-loaded");
    expect(html).not.toContain("<base");
    expect(html).not.toContain("@font-face");
    // Nothing points to another file: the sandbox's CSP would block it.
    expect(html).not.toMatch(/\s(?:src|href)="(?!data:)/);
    expect(html).not.toMatch(/import\(\s*["']\.\//);
  });

  it("AC5: with a UI build that loads no script, the build writes no page and ends well", async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "specty-page-")));
    const ui = join(root, "ui");
    await mkdir(ui, { recursive: true });
    await writeFile(join(ui, "index.html"), "<!doctype html><title>Specty</title>\n");
    const out = join(root, "out");
    await promisify(execFile)(process.execPath, ["build.mjs", "--ui", ui, "--outdir", out], {
      cwd: CLI,
    });
    await expect(readFile(join(out, "specty.mjs"), "utf8")).resolves.toContain("specty");
    await expect(readFile(join(out, "mcp-app.html"), "utf8")).rejects.toThrow();
  });
});
