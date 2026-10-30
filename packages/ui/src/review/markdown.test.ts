// SPDX-License-Identifier: Apache-2.0
import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Markdown } from "./markdown";

@Component({
  imports: [Markdown],
  template: `<sp-markdown [text]="markdown" />`,
})
class Host {
  readonly markdown =
    'Hola **mundo**\n\n<script>window.hacked = true</script><img src=x onerror="window.hacked = true">\n\n```dart\nfinal x = 1;\n```';
}

describe("Markdown", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("formats text and code, and never runs scripts or handlers (AC5)", async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const markdown = (fixture.nativeElement as HTMLElement).querySelector("sp-markdown");
    expect(markdown?.querySelector("strong")?.textContent).toBe("mundo");
    expect(markdown?.querySelector("pre code")?.textContent).toContain("final x = 1;");
    expect(markdown?.querySelector("script")).toBeNull();
    expect(markdown?.querySelector("img")?.getAttribute("onerror")).toBeNull();
    expect((window as unknown as { hacked?: boolean }).hacked).toBeUndefined();
  });

  it("AC3: in the chat, tints its code with the text color instead of the page's ground", async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const classes = (fixture.nativeElement as HTMLElement).querySelector("sp-markdown")?.classList;
    expect(classes?.contains("embedded:[&_code]:bg-text/5")).toBe(true);
    expect(classes?.contains("embedded:[&_pre]:bg-text/5")).toBe(true);
    // The code inside a block keeps no ground of its own.
    expect(classes?.contains("[&_pre_code]:bg-transparent")).toBe(true);
  });
});
