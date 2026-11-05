// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { afterLandingLine, landingNote, resolveConfig } from "../../src";

describe("the command after a change is merged into the main branch", () => {
  it("AC1: says it passed, with the command and the folder, in Spanish and in English", () => {
    const passed = { command: "pnpm build", folder: "/repo", ok: true } as const;
    expect(afterLandingLine(passed, "es")).toBe("Tras incorporarlo, `pnpm build` pasó en /repo.");
    expect(afterLandingLine(passed, "en")).toBe("After merging it, `pnpm build` passed in /repo.");
    expect(landingNote("pnpm build", "es")).toBe(
      "specty: tras incorporarlo, ejecutando `pnpm build`…",
    );
    expect(landingNote("pnpm build", "en")).toBe("specty: after merging it, running `pnpm build`…");
  });

  it("AC2: says it failed, with its last line, for the agent to fix", () => {
    const failed = {
      command: "pnpm build",
      folder: "/repo",
      ok: false,
      last: "error TS2304: Cannot find name 'x'.",
    } as const;
    expect(afterLandingLine(failed, "es")).toBe(
      "Tras incorporarlo, `pnpm build` falló en /repo (error TS2304: Cannot find name 'x'.); el cambio ya está incorporado: corrígelo y vuelve a ejecutarlo allí.",
    );
    expect(afterLandingLine(failed, "en")).toBe(
      "After merging it, `pnpm build` failed in /repo (error TS2304: Cannot find name 'x'.); the change is already merged: fix it and run it there again.",
    );
  });

  it("AC4: takes git.afterLanding only as a text", () => {
    const configured = (git: unknown) => {
      const result = resolveConfig({ version: 1, git });
      return result.ok ? result.config.git : undefined;
    };
    expect(configured({ afterLanding: "pnpm build" })).toMatchObject({
      afterLanding: "pnpm build",
    });
    expect(configured({})).not.toHaveProperty("afterLanding");
    expect(configured({ afterLanding: 3 })).toBeUndefined();
    expect(configured({ afterLanding: "" })).toBeUndefined();
  });
});
