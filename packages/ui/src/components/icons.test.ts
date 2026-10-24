// SPDX-License-Identifier: Apache-2.0
import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { LucideDynamicIcon } from "@lucide/angular";
import * as icons from "./icons";

@Component({
  imports: [LucideDynamicIcon],
  template: `<svg [lucideIcon]="icon" size="16" aria-hidden="true"></svg>`,
})
class Host {
  readonly icon = icons.LucideTriangleAlert;
}

describe("icons", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("gives every icon the UI uses as data, each with its Lucide name and drawing (AC1)", () => {
    const all = Object.entries(icons);
    expect(all.length).toBe(50);
    for (const [exported, data] of all) {
      expect(exported).toMatch(/^Lucide[A-Z]/);
      expect(data.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(data.node.length).toBeGreaterThan(0);
    }
    expect(new Set(all.map(([, data]) => data.name)).size).toBe(all.length);
    expect([icons.LucideFileQuestion.name, icons.LucideTrash2.name]).toEqual([
      "file-question-mark",
      "trash",
    ]);
  });

  it("draws with the one dynamic icon component (AC1)", async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const svg = (fixture.nativeElement as HTMLElement).querySelector("svg");
    expect(svg?.querySelectorAll("path").length).toBe(3);
    expect(svg?.getAttribute("width")).toBe("16");
  });
});
