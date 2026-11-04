// SPDX-License-Identifier: Apache-2.0
import { parse as parseYaml } from "yaml";

/** The YAML between the leading `---` lines, and the text after them. */
const FRONTMATTER = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

/** A memory file read: the YAML of its frontmatter and its body. */
interface Frontmatter {
  /** The YAML read; undefined when it does not read. */
  readonly data: unknown;
  /** The text after the frontmatter, trimmed. */
  readonly body: string;
}

/**
 * The frontmatter of a memory file, an entry or a front (ADR 0016), with Windows line ends read
 * as `\n`; undefined when the file has none.
 */
export function frontmatterOf(markdown: string): Frontmatter | undefined {
  const [, raw, body] = FRONTMATTER.exec(markdown.replaceAll("\r\n", "\n")) ?? [];
  if (raw === undefined) return undefined;
  return { data: loadYaml(raw), body: (body ?? "").trim() };
}

function loadYaml(raw: string): unknown {
  try {
    return parseYaml(raw);
  } catch {
    return undefined;
  }
}
