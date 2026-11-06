// SPDX-License-Identifier: Apache-2.0
// The page of a change nobody picks up after the person's decision: change-page.test.ts is full,
// so it has its own file.
import { Injectable } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router, withComponentInputBinding } from "@angular/router";
import { APP_ROUTES } from "../app/routes";
import { Shell } from "../app/shell";
import { Toasts } from "../components/toast";
import { DERIVER } from "../data/changes-store";
import { FixtureData } from "../data/fixtures";
import { type ChangeRecord, SpectyData } from "../data/records";
import { deriveViews } from "../data/views";

const LOGIN = "20261021-login-google";
const BOLETINES = "20261019-boletines-pdf";
const TOAST = "Nadie retoma tu decisión: mira «Cómo retomarlo».";

/** What the server says when nobody picks up the person's last decision (`unattended`). */
interface Unattended {
  readonly since: string;
  readonly wait?: {
    readonly tool?: string;
    readonly ended: "timeout" | "stopped";
    readonly ago: number;
  };
  readonly holder?: { readonly tool: string; readonly ago: number };
}

const TIMED_OUT: Unattended = {
  since: new Date().toISOString(),
  wait: { tool: "claude-code", ended: "timeout", ago: 12 },
};

/** The changes nobody picks up when the page opens, and what the server says of each. */
let initial: ReadonlyMap<string, Unattended> = new Map();

/** The sample project, where the `marked` changes carry `unattended`, each in its folder. */
@Injectable()
class Unpicked extends FixtureData {
  readonly marked = new Map(initial);
  private readonly heard = new Set<() => void>();

  override async changes(): Promise<readonly ChangeRecord[]> {
    return (await super.changes()).map((record) => {
      const unattended = this.marked.get(record.state.id);
      if (unattended === undefined) return record;
      const marks: { readonly unattended: Unattended } = { unattended };
      return { ...record, folder: `/repo/.worktrees/${record.state.id}`, ...marks };
    });
  }

  override subscribe(listener: () => void): () => void {
    this.heard.add(listener);
    const stop = super.subscribe(listener);
    return () => {
      this.heard.delete(listener);
      stop();
    };
  }

  /** Says something changed, as the local server's events do. */
  tell(): void {
    for (const listener of this.heard) listener();
  }
}

async function open(url: string) {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.clear();
  localStorage.setItem("specty.lang", "es");
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter(APP_ROUTES, withComponentInputBinding()),
      { provide: SpectyData, useClass: Unpicked },
      {
        provide: DERIVER,
        useValue: (records: readonly ChangeRecord[]) => Promise.resolve(deriveViews(records)),
      },
    ],
  });
  const fixture = TestBed.createComponent(Shell);
  const element: HTMLElement = fixture.nativeElement;
  const settle = async () => {
    for (let round = 0; round < 40; round++) {
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));
    }
  };
  const router = TestBed.inject(Router);
  await router.navigateByUrl(url);
  await settle();
  const source = TestBed.inject(SpectyData);
  if (!(source instanceof Unpicked)) throw new Error("the page does not run on the test's source");
  const toasts = () =>
    TestBed.inject(Toasts)
      .items()
      .map((item) => item.text)
      .filter((said) => said === TOAST);
  return { element, source, settle, router, toasts };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

describe("ChangePage of a change nobody picks up after the person's decision", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    initial = new Map();
  });

  it("AC3: shows «Cómo retomarlo» above the tabs, though no conversation left it nor is it an orphan", async () => {
    initial = new Map([[LOGIN, TIMED_OUT]]);
    const { element } = await open(`/changes/${LOGIN}`);
    const panel = element.querySelector("sp-change-page sp-resume-hints");
    const tabs = element.querySelector("sp-change-page sp-tabs");
    expect(panel).not.toBeNull();
    expect(
      (panel?.compareDocumentPosition(tabs as Node) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(text(panel?.querySelector("[data-why]"))).toBe(
      "El specty wait del agente (claude-code) agotó su tiempo hace 12 min.",
    );
  });

  it("AC4: says it in a toast when it appears while the person is on the page, once", async () => {
    const { element, source, settle, toasts } = await open(`/changes/${LOGIN}`);
    expect(element.querySelector("sp-change-page sp-resume-hints")).toBeNull();
    expect(toasts()).toEqual([]);
    source.marked.set(LOGIN, TIMED_OUT);
    source.tell();
    await settle();
    expect(element.querySelector("sp-change-page sp-resume-hints")).not.toBeNull();
    expect(toasts()).toEqual([TOAST]);
    source.tell();
    await settle();
    expect(toasts()).toEqual([TOAST]);
  });

  it("AC4: no toast when the page opens with it already there, nor on going to another change's page", async () => {
    initial = new Map([[LOGIN, TIMED_OUT]]);
    const { element, settle, router, toasts } = await open(`/changes/${LOGIN}`);
    expect(element.querySelector("sp-change-page sp-resume-hints")).not.toBeNull();
    expect(toasts()).toEqual([]);
    await router.navigateByUrl(`/changes/${BOLETINES}`);
    await settle();
    await router.navigateByUrl(`/changes/${LOGIN}`);
    await settle();
    expect(text(element.querySelector("sp-change-page [data-hero] h1"))).toBe("Login con Google");
    expect(toasts()).toEqual([]);
  });
});
