---
kind: quick
---

# Bloque de flujo de AGENTS.md al día

## Objetivo

`specty init` regeneró el bloque de flujo de AGENTS.md con la regla del modo delegado: el agente solo ejecuta aprobar, aceptar y cerrar si `SIGUIENTE:` se lo pide. El cambio quedó sin commit en la carpeta principal. Este cambio lo lleva a `main` por el flujo de Specty, con el texto idéntico al que escribió `init`, y la carpeta principal queda limpia.

## Archivos

- modificar AGENTS.md — bloque de flujo tal como lo regenera `specty init`

## Tareas

- [x] T1: Llevar a `main` el bloque de flujo regenerado
  - files: AGENTS.md
  - verify: pnpm lint
  - type: docs

## Cierre

### Resumen

AGENTS.md con el bloque de flujo tal como lo regeneró specty init en la carpeta principal (copiado byte a byte): añade que el agente solo ejecuta aprobar, aceptar y cerrar si SIGUIENTE se lo pide, en modo delegado. La carpeta principal quedó restaurada para que el cierre pueda avanzar main
