// SPDX-License-Identifier: Apache-2.0
import { type ConfigIssue, type ResolvedConfig, resolveConfig } from "@baquia-dev/specty-core";
import { parse } from "yaml";
import { readText } from "../io/files";
import type { RepoPaths } from "./paths";

export type ConfigLoad =
  | { readonly kind: "missing" }
  | { readonly kind: "invalid"; readonly issues: readonly ConfigIssue[] }
  | { readonly kind: "ok"; readonly config: ResolvedConfig };

export async function loadConfig(paths: RepoPaths): Promise<ConfigLoad> {
  const text = await readText(paths.config);
  if (text === undefined) return { kind: "missing" };
  const parsed = parseYaml(text);
  if (!parsed.ok)
    return { kind: "invalid", issues: [{ path: "config.yaml", message: parsed.error }] };
  const result = resolveConfig(parsed.value);
  return result.ok
    ? { kind: "ok", config: result.config }
    : { kind: "invalid", issues: result.issues };
}

function parseYaml(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    const value: unknown = parse(text);
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
