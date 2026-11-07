// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { type ProcessBudgetView, processBudgetNote } from "../../src";

const GIB = 1024 ** 3;

/** A task's command with 14 cores, 2 places and 6.73 GiB available, which lower it to 6. */
const TASK: ProcessBudgetView = {
  budget: 6,
  variables: [{ name: "VITEST_MAX_WORKERS", value: 6 }],
  memory: 6.73 * GIB,
  cores: 14,
  places: 1,
  slots: 2,
};

/** The full verification's command on the same machine, with two variables. */
const FULL: ProcessBudgetView = {
  ...TASK,
  budget: 13,
  variables: [
    { name: "PROCESOS_A", value: 13 },
    { name: "PROCESOS_B", value: 13 },
  ],
  places: 2,
};

describe("the line that tells how many processes a verification's command may start", () => {
  it("AC1: tells the number, its variable, the memory available in GB, the cores and the places, in Spanish and in English", () => {
    expect(processBudgetNote(TASK, "es")).toBe(
      "specty: 6 procesos en VITEST_MAX_WORKERS (6,7 GB de memoria disponible, 14 núcleos, 1 de 2 plazas)",
    );
    expect(processBudgetNote(TASK, "en")).toBe(
      "specty: 6 processes in VITEST_MAX_WORKERS (6.7 GB of memory available, 14 cores, 1 of 2 places)",
    );
  });

  it("AC1: names every variable that gets the number, the last one after «y» or «and»", () => {
    expect(processBudgetNote(FULL, "es")).toBe(
      "specty: 13 procesos en PROCESOS_A y PROCESOS_B (6,7 GB de memoria disponible, 14 núcleos, 2 de 2 plazas)",
    );
    expect(processBudgetNote(FULL, "en")).toBe(
      "specty: 13 processes in PROCESOS_A and PROCESOS_B (6.7 GB of memory available, 14 cores, 2 of 2 places)",
    );
    const three: ProcessBudgetView = {
      ...FULL,
      variables: [...FULL.variables, { name: "PROCESOS_C", value: 13 }],
    };
    expect(processBudgetNote(three, "es")).toContain(
      "13 procesos en PROCESOS_A, PROCESOS_B y PROCESOS_C (",
    );
    expect(processBudgetNote(three, "en")).toContain(
      "13 processes in PROCESOS_A, PROCESOS_B and PROCESOS_C (",
    );
  });

  it("AC1: says one process, one core and one place in the singular, and the memory with one decimal", () => {
    const one: ProcessBudgetView = {
      budget: 1,
      variables: [{ name: "PROCESOS_A", value: 1 }],
      memory: 0.5 * GIB,
      cores: 1,
      places: 1,
      slots: 1,
    };
    expect(processBudgetNote(one, "es")).toBe(
      "specty: 1 proceso en PROCESOS_A (0,5 GB de memoria disponible, 1 núcleo, 1 de 1 plaza)",
    );
    expect(processBudgetNote(one, "en")).toBe(
      "specty: 1 process in PROCESOS_A (0.5 GB of memory available, 1 core, 1 of 1 place)",
    );
    const big = { ...TASK, memory: 23.96 * GIB };
    expect(processBudgetNote(big, "es")).toContain("(24,0 GB de memoria disponible,");
    expect(processBudgetNote(big, "en")).toContain("(24.0 GB of memory available,");
  });

  it("AC2: names apart, with its value, a variable that keeps the smaller number of its environment", () => {
    const kept: ProcessBudgetView = {
      ...FULL,
      variables: [
        { name: "PROCESOS_A", value: 1 },
        { name: "PROCESOS_B", value: 13 },
      ],
    };
    expect(processBudgetNote(kept, "es")).toBe(
      "specty: 13 procesos en PROCESOS_B; se queda con el de su entorno: PROCESOS_A=1 (6,7 GB de memoria disponible, 14 núcleos, 2 de 2 plazas)",
    );
    expect(processBudgetNote(kept, "en")).toBe(
      "specty: 13 processes in PROCESOS_B; keeps its environment's: PROCESOS_A=1 (6.7 GB of memory available, 14 cores, 2 of 2 places)",
    );
  });

  it("AC2: with every variable keeping its own, tells the number alone and names them all apart", () => {
    const kept: ProcessBudgetView = {
      ...FULL,
      variables: [
        { name: "PROCESOS_A", value: 1 },
        { name: "PROCESOS_B", value: 2 },
      ],
    };
    expect(processBudgetNote(kept, "es")).toBe(
      "specty: 13 procesos; se quedan con el de su entorno: PROCESOS_A=1, PROCESOS_B=2 (6,7 GB de memoria disponible, 14 núcleos, 2 de 2 plazas)",
    );
    expect(processBudgetNote(kept, "en")).toBe(
      "specty: 13 processes; keep their environment's: PROCESOS_A=1, PROCESOS_B=2 (6.7 GB of memory available, 14 cores, 2 of 2 places)",
    );
  });
});
