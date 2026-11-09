// SPDX-License-Identifier: Apache-2.0

describe("the time each test of the UI has", () => {
  it("AC1: a test has 30 seconds, not Vitest's 5, so a loaded machine does not cut it", ({
    task,
  }) => {
    expect(task.timeout).toBe(30_000);
  });
});
