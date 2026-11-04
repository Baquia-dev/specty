---
kind: quick
---

# La gravedad que da un revisor real, comprobada

## Objetivo

Resuelve P44. Las observaciones de la revisión (`reviewRemarks`) esperan que cada viñeta de primer nivel de la respuesta lleve su gravedad, y solo se había probado con un revisor falso. Se comprobó con un revisor real, el comando que recomienda el ADR 0011 con Claude Code 2.1.318, sobre la spec y el diff de un cambio real (`20261104-fallo-de-tipos-con-contract`), en español y en inglés. Todas las viñetas empiezan por su gravedad y la regla las reconoce. El ADR lo anota en sus consecuencias.

## Archivos

- modificar docs/decisions/0011-revision-independiente.md — la comprobación con un revisor real

## Tareas

- [x] T1: El ADR 0011 anota la comprobación con un revisor real
  - files: docs/decisions/0011-revision-independiente.md
  - verify: grep -q "2.1.318" docs/decisions/0011-revision-independiente.md
  - type: docs

## Cierre

### Resumen

El ADR 0011 anota la comprobación con un revisor real (Claude Code 2.1.318, el comando del ADR, español e inglés): cada viñeta de primer nivel empieza por su gravedad y reviewRemarks las reconoce todas.
