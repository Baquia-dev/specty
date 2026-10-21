---
kind: epic
---

# Student dashboard

## Goal

Students see their grades, attendance and alerts on one dashboard.

## Out of scope

- Teacher views.

## Assumptions

- A1: The backend already exposes grades and attendance per student.
  - impact: high

## Acceptance criteria

- AC1: WHEN a student opens the dashboard THEN they see grades, attendance and alerts.
- AC2: WHEN a card fails to load THEN it shows a retry action.

## Slices

- C1: API contracts and typed models
  - ac: AC2
- C2: Grades card
  - ac: AC1, AC2
  - depends: C1
- C3: Attendance and alerts cards
  - ac: AC1
  - depends: C1

## Risks

- R1: Three cards loading in parallel may slow the first paint; measure on a mid-range phone.
