// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { browserCommand, openInBrowser } from "../src/io/browser";

describe("browser", () => {
  it("AC4: browserCommand returns the command and arguments for darwin, win32 and linux", () => {
    const url = "http://localhost:4173/?token=abc";
    expect(browserCommand(url, "darwin")).toEqual(["open", [url]]);
    expect(browserCommand(url, "win32", { ComSpec: "C:\\cmd.exe" })).toEqual([
      "C:\\cmd.exe",
      ["/c", "start", '""', url],
    ]);
    expect(browserCommand(url, "linux")).toEqual(["xdg-open", [url]]);
  });

  it("does not spawn in test environments", () => {
    expect(() => openInBrowser("http://localhost:4173", "darwin")).not.toThrow();
  });
});
