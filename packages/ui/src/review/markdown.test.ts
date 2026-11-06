// SPDX-License-Identifier: Apache-2.0
import { Component, signal } from "@angular/core";
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

const RLO = String.fromCodePoint(0x202e);
const LRI = String.fromCodePoint(0x2066);
const PDI = String.fromCodePoint(0x2069);
const RLM = String.fromCodePoint(0x200f);

/** The code a character of text direction shows as: as the terminal writes it. */
const codeOf = (char: string) => `\\u${(char.codePointAt(0) ?? 0).toString(16).padStart(4, "0")}`;

const TITLE = {
  es: "Carácter de dirección del texto: se muestra su código porque podría reordenar lo que lees",
  en: "Text direction character: its code is shown because it could reorder what you read",
};

/** Whether a text has a character of text direction that the browser would apply. */
const appliesDirection = (text: string) =>
  Array.from(text).some((char) => {
    const code = char.codePointAt(0) ?? 0;
    return (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069);
  });

/** A goal that reads otherwise than it is, in its text, in its code and in a link's title. */
const HIDDEN = [
  `Solo ${RLO}edita el **admin**${PDI} y nadie más.`,
  "",
  `Con \`canEdit("user${RLO}")\` basta.`,
  "",
  "```ts",
  `const level = "user${LRI}";`,
  "```",
  "",
  `[La guía](https://example.com "Lee${RLO} esto")`,
].join("\n");

@Component({
  imports: [Markdown],
  template: `<sp-markdown [text]="markdown()" />`,
})
class Shown {
  readonly markdown = signal(HIDDEN);
}

async function show(markdown: string, lang: "es" | "en" = "es") {
  localStorage.setItem("specty.lang", lang);
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(Shown);
  fixture.componentInstance.markdown.set(markdown);
  await fixture.whenStable();
  const element: HTMLElement = fixture.nativeElement;
  const shown = element.querySelector("sp-markdown");
  const marks = [...(shown?.querySelectorAll<HTMLElement>("span[title]") ?? [])];
  return { shown, marks };
}

describe("Markdown, with characters of text direction", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC1: shows each one in the text and in the code as its code, in the attention tone, and keeps the rest", async () => {
    const { shown, marks } = await show(HIDDEN);
    expect(marks.map((mark) => mark.textContent)).toEqual([
      codeOf(RLO),
      codeOf(PDI),
      codeOf(RLO),
      codeOf(LRI),
    ]);
    for (const mark of marks) {
      expect(mark.className).toContain("text-phase-review");
      expect(mark.className).toContain("bg-phase-review-bg");
    }
    expect(shown?.querySelector("p code span[title]")?.textContent).toBe(codeOf(RLO));
    expect(shown?.querySelector("pre code span[title]")?.textContent).toBe(codeOf(LRI));
    // The rest keeps its format.
    expect(shown?.querySelector("strong")?.textContent).toBe("admin");
    expect(shown?.querySelector("p")?.textContent).toBe(
      `Solo ${codeOf(RLO)}edita el admin${codeOf(PDI)} y nadie más.`,
    );
    expect(shown?.querySelector("pre code")?.textContent).toContain(
      `const level = "user${codeOf(LRI)}";`,
    );
    // Inside a tag, such as a link's title, the code goes plain: nothing there shows as text.
    const link = shown?.querySelector("a");
    expect(link?.textContent).toBe("La guía");
    expect(link?.getAttribute("title")).toBe(`Lee${codeOf(RLO)} esto`);
    expect(appliesDirection(shown?.innerHTML ?? "")).toBe(false);
  });

  it("AC6: the title of each one says what it is, in Spanish and in English", async () => {
    for (const lang of ["es", "en"] as const) {
      const { marks } = await show(HIDDEN, lang);
      expect(marks.map((mark) => mark.title)).toEqual(Array.from({ length: 4 }, () => TITLE[lang]));
    }
  });

  it("AC7: a text with none, though right to left or with a direction mark, shows as before", async () => {
    const plain = `Dice «שלום${RLM}» en **hebreo**.\n\n\`עברית\``;
    const { shown, marks } = await show(plain);
    expect(marks).toEqual([]);
    expect(shown?.querySelector("p")?.textContent).toBe(`Dice «שלום${RLM}» en hebreo.`);
    expect(shown?.querySelector("strong")?.textContent).toBe("hebreo");
    expect(shown?.querySelector("p code")?.textContent).toBe("עברית");
  });
});
