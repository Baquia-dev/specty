// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { parseOpenSpec } from "../src";

const PROPOSAL = `# Change: Add two-factor authentication

## Why
Accounts are taken over with leaked passwords.

## What Changes
- Add an OTP challenge after the password.
- Store a secret per user.

## Impact
- Affected code: \`src/auth/\`
`;

const TASKS = `## 1. Implementation
- [x] 1.1 Add the OTP column
- [ ] 1.2 Ask for the code at login
- [ ] Send the code by email
`;

const SPEC = `## ADDED Requirements
### Requirement: Two-factor login
The system SHALL ask for a second factor.

#### Scenario: OTP required
- **GIVEN** a user with two-factor on
- **WHEN** they submit valid credentials
- **AND** the device is new
- **THEN** an OTP challenge is required

#### Scenario: Half written
- **WHEN** something happens

### Requirement: Recovery codes
The system SHALL offer ten recovery codes.

## REMOVED Requirements
### Requirement: Remember me
`;

describe("parseOpenSpec", () => {
  it("AC1: reads the proposal, the tasks, the design and each scenario", () => {
    const change = parseOpenSpec({
      proposal: PROPOSAL,
      tasks: TASKS,
      design: "# Design: 2FA\n\nTOTP with a 30 s window.\n",
      specs: [{ capability: "auth", text: SPEC }],
    });
    expect(change).toEqual({
      title: "Add two-factor authentication",
      why: "Accounts are taken over with leaked passwords.",
      whatChanges: "- Add an OTP challenge after the password.\n- Store a secret per user.",
      other: [{ heading: "Impact", body: "- Affected code: `src/auth/`" }],
      design: "TOTP with a 30 s window.",
      scenarios: [
        {
          given: "a user with two-factor on",
          when: "they submit valid credentials and the device is new",
          outcome: "an OTP challenge is required",
        },
      ],
      loose: [
        "auth: Two-factor login — Half written: WHEN something happens",
        "auth: Recovery codes — The system SHALL offer ten recovery codes.",
      ],
      removed: ["auth: Remember me"],
      pending: ["Ask for the code at login", "Send the code by email"],
      done: ["Add the OTP column"],
    });
  });

  it("AC2: takes a bare proposal, keeping what has no place of its own", () => {
    const change = parseOpenSpec({
      proposal: "Some notes without a title.\n\n## Risks\nNone known.\n",
      specs: [],
    });
    expect(change).toEqual({
      other: [
        { heading: "", body: "Some notes without a title." },
        { heading: "Risks", body: "None known." },
      ],
      scenarios: [],
      loose: [],
      removed: [],
      pending: [],
      done: [],
    });
    expect(
      parseOpenSpec({ proposal: "# Proposal: Out\n\n## Out of Scope\n- SMS\n", specs: [] }),
    ).toMatchObject({ title: "Out", outOfScope: "- SMS" });
  });
});
