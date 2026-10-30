// SPDX-License-Identifier: Apache-2.0
import { TestBed } from "@angular/core/testing";
import { HostLook } from "./host-look";

const root = () => document.documentElement;

/** A fresh look on a system that prefers `dark`, with nothing remembered in this browser. */
function lookOn(dark: boolean): HostLook {
  window.matchMedia = (() => ({
    matches: dark,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.clear();
  root().removeAttribute("style");
  TestBed.resetTestingModule();
  const look = TestBed.inject(HostLook);
  TestBed.tick();
  return look;
}

describe("the look the MCP host gives the view", () => {
  afterEach(() => {
    root().removeAttribute("style");
    TestBed.resetTestingModule();
  });

  it("AC6: takes the host's theme over the system's, and follows the system without one", () => {
    const look = lookOn(false);
    expect(root().dataset.theme).toBe("light");
    look.take({ theme: "dark" });
    TestBed.tick();
    expect(root().dataset.theme).toBe("dark");
    look.take({ theme: "light" });
    TestBed.tick();
    expect(root().dataset.theme).toBe("light");

    const silent = lookOn(true);
    silent.take({ displayMode: "inline" });
    TestBed.tick();
    expect(root().dataset.theme).toBe("dark");
    silent.take({ theme: "sepia" });
    TestBed.tick();
    expect(root().dataset.theme).toBe("dark");
  });

  it("AC7: puts the host's variables on the root, changes only those an update brings, and ignores the rest", () => {
    const look = lookOn(true);
    look.take({
      styles: {
        variables: {
          "--color-text-primary": "#f5f4ef",
          "--color-border-primary": "rgba(255, 255, 255, 0.1)",
          "--font-sans": "Inter, system-ui, sans-serif",
          "--color-ring-primary": undefined,
          "--shadow-sm": 3,
          color: "red",
        },
      },
    });
    const style = root().style;
    expect(style.getPropertyValue("--color-text-primary")).toBe("#f5f4ef");
    expect(style.getPropertyValue("--color-border-primary")).toBe("rgba(255, 255, 255, 0.1)");
    expect(style.getPropertyValue("--font-sans")).toBe("Inter, system-ui, sans-serif");
    expect(style.getPropertyValue("--color-ring-primary")).toBe("");
    expect(style.getPropertyValue("--shadow-sm")).toBe("");
    expect(style.color).toBe("");

    // A partial update: only what it brings changes.
    look.take({ styles: { variables: { "--font-sans": "Menlo, monospace" } } });
    expect(style.getPropertyValue("--font-sans")).toBe("Menlo, monospace");
    expect(style.getPropertyValue("--color-text-primary")).toBe("#f5f4ef");

    // An update without styles leaves them, and nonsense changes nothing.
    look.take({ theme: "light" });
    look.take({ styles: "none" });
    look.take(undefined);
    look.take({ styles: { variables: ["--font-sans", "Arial"] } });
    expect(style.getPropertyValue("--font-sans")).toBe("Menlo, monospace");
    expect(style.getPropertyValue("--color-border-primary")).toBe("rgba(255, 255, 255, 0.1)");
  });
});
