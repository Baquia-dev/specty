// SPDX-License-Identifier: Apache-2.0
// The change page with tests to approve: change-page.test.ts is full, so the tests have their own.
import { Injectable } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router, withComponentInputBinding } from "@angular/router";
import { APP_ROUTES } from "../app/routes";
import { Shell } from "../app/shell";
import { DERIVER } from "../data/changes-store";
import { FixtureData } from "../data/fixtures";
import { type ChangeRecord, SpectyData } from "../data/records";
import { deriveViews } from "../data/views";

const LOGIN = "20261021-login-google";
const SENT_AT = "2026-10-28T10:00:00.000Z";

/** Whether the agent of the next page sent its tests. */
let sent = true;

/** The sample login change, back in `testing`: with its tests sent, or while it writes them. */
function inTesting(record: ChangeRecord): ChangeRecord {
  const { testsSubmittedAt: _before, ...state } = record.state;
  const proposed = {
    ts: SENT_AT,
    actor: "agent" as const,
    event: "tests.proposed",
    data: { count: 1, files: ["test/login_test.dart"], red: [{ cmd: "flutter test", exit: 1 }] },
  };
  return sent
    ? {
        ...record,
        state: { ...state, phase: "testing", testsSubmittedAt: SENT_AT },
        audit: [...(record.audit ?? []), proposed],
      }
    : { ...record, state: { ...state, phase: "testing" } };
}

@Injectable()
class WithTests extends FixtureData {
  override async changes(): Promise<readonly ChangeRecord[]> {
    const records = await super.changes();
    return records.map((record) => (record.state.id === LOGIN ? inTesting(record) : record));
  }
}

async function open(withTests: boolean) {
  sent = withTests;
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
      { provide: SpectyData, useClass: WithTests },
      {
        provide: DERIVER,
        useValue: (records: readonly ChangeRecord[]) => Promise.resolve(deriveViews(records)),
      },
    ],
  });
  const fixture = TestBed.createComponent(Shell);
  const element: HTMLElement = fixture.nativeElement;
  await TestBed.inject(Router).navigateByUrl(`/changes/${LOGIN}`);
  for (let round = 0; round < 40; round++) {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
  }
  const hero = () => element.querySelector("sp-change-page [data-hero]");
  const bar = () => element.querySelector("sp-change-page [data-sticky]");
  return { element, hero, bar };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

describe("ChangePage with tests to approve", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC1: says it waits for the person and offers «Aprobar los tests» beside the title and in the bar", async () => {
    const { element, hero, bar } = await open(true);
    expect(text(hero()?.querySelector("[data-waiting]"))).toBe("Espera que apruebes los tests");
    expect(text(hero()?.querySelector("sp-tests-actions"))).toBe("Aprobar los tests");
    expect(bar()?.querySelector("sp-tests-actions")?.hasAttribute("data-compact")).toBe(true);
    // It opens on Progress, with the tests sent first.
    expect(text(element.querySelector("sp-tests-sent h2"))).toBe("Tests por aprobar");
  });

  it("AC1: offers nothing while the agent still writes them", async () => {
    const { element, hero, bar } = await open(false);
    expect(hero()?.querySelector("[data-waiting]")).toBeNull();
    expect(hero()?.querySelector("sp-tests-actions")).toBeNull();
    expect(bar()?.querySelector("sp-tests-actions")).toBeNull();
    expect(text(element.querySelector("sp-tests-sent h2"))).toBe("Tests");
  });
});
