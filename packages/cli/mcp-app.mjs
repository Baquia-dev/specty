// SPDX-License-Identifier: Apache-2.0
// The page of the MCP App (ADR 0015): the UI's build as one HTML, because the sandbox of an MCP
// host lets the view load no file, connect nowhere and start no worker. Its entry is bundled with
// everything it loads, chunks included; its styles go in, without their fonts; and a mark tells
// the UI to start as the embedded view of one change.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { build } from "esbuild";

const MARK = '<meta name="specty-data" content="mcp-app">';
const FONT_FACE = /@font-face\s*\{[^}]*\}/g;

/**
 * The chunks of shiki's grammars and themes, by what only they carry: two thirds of the build.
 * Only the diff viewer highlights, and the view gets no diffs, so they never load in the chat.
 */
const HIGHLIGHTING = /"scopeName"|"tokenColors"/;

/** Each chunk of the highlighter, empty: nothing in the view runs it. */
const withoutHighlighting = {
  name: "without-highlighting",
  setup(build) {
    build.onLoad({ filter: /[\\/]chunk-[^\\/]*\.js$/ }, async ({ path }) => {
      const text = await readFile(path, "utf8");
      return HIGHLIGHTING.test(text) ? { contents: emptyLike(text), loader: "js" } : undefined;
    });
  },
};

/** A module with the same exports as `text`, all empty: grammars import each other by name. */
function emptyLike(text) {
  const names = new Set();
  for (const [, list] of text.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of list.split(",")) {
      const name = part
        .trim()
        .split(/\s+as\s+/)
        .pop();
      if (name) names.add(name);
    }
  }
  if (/export\s+default\b/.test(text)) names.add("default");
  return `const empty = []; export { ${[...names].map((name) => `empty as ${name}`).join(", ")} };`;
}

/** The UI's build in `ui` as one HTML; nothing when its `index.html` loads no script to pack. */
export async function mcpAppPage(ui) {
  const index = await readFile(join(ui, "index.html"), "utf8");
  const entry = /<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/.exec(index)?.[1];
  if (entry === undefined) return undefined;
  const bundled = await build({
    entryPoints: [join(ui, entry)],
    bundle: true,
    // Lazy chunks included: without splitting, a dynamic import stays in the same file.
    splitting: false,
    format: "esm",
    minify: true,
    write: false,
    logLevel: "silent",
    legalComments: "none",
    plugins: [withoutHighlighting],
  });
  const styles = await Promise.all(
    [...index.matchAll(/<link\b[^>]*>/g)]
      .map(([tag]) =>
        /\brel="stylesheet"/.test(tag) ? /\bhref="([^"]+)"/.exec(tag)?.[1] : undefined,
      )
      .filter((href) => href !== undefined)
      .map((href) => readFile(join(ui, href), "utf8")),
  );
  const css = [...new Set(styles)].join("\n").replace(FONT_FACE, "");
  const script = inlined(bundled.outputFiles[0]?.text ?? "");
  return (
    index
      .replace(/<base\b[^>]*>\s*/g, "")
      .replace(/<noscript>[\s\S]*?<\/noscript>\s*/g, "")
      .replace(/<link\b[^>]*>\s*/g, "")
      .replace(/<script\b[^>]*\bsrc="[^"]*"[^>]*><\/script>\s*/g, "")
      .replace(FONT_FACE, "")
      // Functions, not strings: `$` in the script or the styles would read as a replacement pattern.
      .replace("</head>", () => `${MARK}\n<style>${css}</style>\n</head>`)
      .replace("</body>", () => `<script type="module">${script}</script>\n</body>`)
  );
}

/** Script text that cannot end its own `<script>` element or open an HTML comment in it. */
function inlined(script) {
  return script.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");
}
