// SPDX-License-Identifier: Apache-2.0
import { TestBed } from "@angular/core/testing";
import { InboxState } from "./inbox-state";

function create(): InboxState {
  TestBed.resetTestingModule();
  return TestBed.inject(InboxState);
}

describe("InboxState", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it("starts by state and longest wait, showing everything (AC4, AC6)", () => {
    const state = create();
    expect(state.filters()).toEqual({ query: "", phase: "all", group: "state", sort: "waiting" });
    expect(state.filtered()).toBe(false);
  });

  it("remembers grouping and sorting in this browser, not the search or the phase (AC6)", () => {
    const state = create();
    state.group.set("phase");
    state.sort.set("title");
    state.query.set("evolución");
    state.phase.set("review");
    TestBed.tick();
    expect(localStorage.getItem("specty.inbox.group")).toBe("phase");
    expect(localStorage.getItem("specty.inbox.sort")).toBe("title");
    expect(state.filtered()).toBe(true);

    // A reload: a new app with the same browser storage.
    const again = create();
    expect(again.filters()).toEqual({ query: "", phase: "all", group: "phase", sort: "title" });
  });

  it("ignores what it does not know, and works without storage (AC6)", () => {
    localStorage.setItem("specty.inbox.group", "whatever");
    expect(create().group()).toBe("state");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const state = create();
    expect(state.sort()).toBe("waiting");
    state.sort.set("size");
    expect(() => TestBed.tick()).not.toThrow();
    expect(state.sort()).toBe("size");
  });

  it("clears the search and the phase, keeping grouping and sorting (AC5)", () => {
    const state = create();
    state.query.set("pdf");
    state.phase.set("implementing");
    state.group.set("none");
    state.clear();
    expect(state.filters()).toEqual({ query: "", phase: "all", group: "none", sort: "waiting" });
  });
});
