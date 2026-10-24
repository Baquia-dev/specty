// SPDX-License-Identifier: Apache-2.0
import type { ChangeState, Phase } from "@baquia-dev/specty-core";
import type { ChangeRecord } from "./records";
import { sharedFiles } from "./shared";

/** A change titled `title` whose Files section lists `files`, with approved `extras` in T1. */
function change(
  id: string,
  title: string,
  files: readonly string[],
  { phase = "implementing", extras = [] }: { phase?: Phase; extras?: readonly string[] } = {},
): ChangeRecord {
  const listed = files.map((file) => `- modificar ${file} — motivo`).join("\n");
  const state: ChangeState = {
    schema: 1,
    id,
    kind: "standard",
    phase,
    revision: 1,
    items: {},
    tasks: { T1: { status: "active", attempts: 0, scopeExtra: [...extras] } },
    pending: { scopeRequests: [], adjustment: null },
    maxIds: {},
  };
  return {
    spec: `# ${title}\n\n## Objetivo\n\nAlgo.\n\n## Archivos\n\n${listed}\n`,
    state,
    phaseSince: "2026-10-24T10:00:00.000Z",
  };
}

describe("sharedFiles", () => {
  it("names the governed files open changes would both touch, with the others' titles (AC2)", () => {
    const shared = sharedFiles([
      change("a", "Saludo", ["src/app.ts", "src/util.ts", "README.md"]),
      change("b", "Despedida", ["src/app.ts", "docs/guia.md", "README.md"]),
      change("c", "Ayudas", ["lib/other.ts"], { extras: ["src/util.ts"] }),
    ]);
    expect(shared.get("a")).toEqual([
      { path: "src/app.ts", changes: [{ id: "b", title: "Despedida" }] },
      { path: "src/util.ts", changes: [{ id: "c", title: "Ayudas" }] },
    ]);
    expect(shared.get("b")).toEqual([
      { path: "src/app.ts", changes: [{ id: "a", title: "Saludo" }] },
    ]);
    expect(shared.get("c")?.map(({ path }) => path)).toEqual(["src/util.ts"]);
  });

  it("matches globs both ways, and leaves finished changes out (AC2)", () => {
    const shared = sharedFiles([
      change("a", "Pantallas", ["src/screens/**"]),
      change("b", "Inicio", ["src/screens/home.ts"]),
      change("c", "Hecho", ["src/screens/home.ts"], { phase: "done" }),
      change("d", "Cancelado", ["src/screens/home.ts"], { phase: "cancelled" }),
    ]);
    expect(shared.get("a")).toEqual([
      { path: "src/screens/**", changes: [{ id: "b", title: "Inicio" }] },
    ]);
    expect(shared.get("b")?.[0]?.changes).toEqual([{ id: "a", title: "Pantallas" }]);
    expect([shared.has("c"), shared.has("d")]).toEqual([false, false]);
  });
});
