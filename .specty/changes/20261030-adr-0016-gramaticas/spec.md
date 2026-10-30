---
kind: quick
follows:
  - 20261030-tree-sitter-mide-las-funciones
---

# El ADR 0016 cuenta bien las gramáticas

## Objetivo

Las consecuencias del ADR 0016 dicen que el paquete ocupa 1,8 MB «con los diecisiete de la épica y el runtime». Son dieciséis gramáticas más el runtime: diecisiete archivos. El texto pasa a decirlo así.

## Archivos

- modificar docs/decisions/0016-tree-sitter-para-medir-las-funciones.md — el número de gramáticas

## Tareas

- [ ] T1: El ADR 0016 cuenta dieciséis gramáticas y el runtime
  - files: docs/decisions/0016-tree-sitter-para-medir-las-funciones.md
  - ac: —
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-docs.test.ts
  - type: docs
