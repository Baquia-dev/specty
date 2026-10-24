---
kind: quick
---

# ARCHITECTURE: el primer changes llega con la foto inicial

## Objetivo

ARCHITECTURE §15 dice que `/api/events` emite `changes` «al conectarse». Desde «Tests del servidor sin carreras de tiempo» lo emite cuando el servidor ya tiene su foto inicial de los archivos, para que nada de lo que cambie después se pierda. El documento lo cuenta así.

## Archivos

- modificar docs/ARCHITECTURE.md — §15: cuándo llega el primer `changes` y por qué

## Tareas

- [x] T1: Precisar cuándo llega el primer changes
  - files: docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm lint
  - type: docs

## Cierre

### Resumen

ARCHITECTURE §15: el primer changes de /api/events sale cuando el servidor tiene su primera firma (por qué, y que como mucho llega uno de más), y run cubre la verificación completa y la de una tarea, con las últimas líneas antes de run: null
