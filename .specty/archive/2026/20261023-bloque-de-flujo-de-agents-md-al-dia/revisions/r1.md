---
kind: quick
---

# Bloque de flujo de AGENTS.md al día

## Objetivo

`specty init` regeneró el bloque de flujo de AGENTS.md con la regla del modo delegado: el agente solo ejecuta aprobar, aceptar y cerrar si `SIGUIENTE:` se lo pide. El cambio quedó sin commit en la carpeta principal. Este cambio lo lleva a `main` por el flujo de Specty, con el texto idéntico al que escribió `init`, y la carpeta principal queda limpia.

## Archivos

- modificar AGENTS.md — bloque de flujo tal como lo regenera `specty init`

## Tareas

- [ ] T1: Llevar a `main` el bloque de flujo regenerado
  - files: AGENTS.md
  - verify: pnpm lint
  - type: docs
