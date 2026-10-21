---
kind: standard
---

# Mi evolución académica

## Objetivo

El estudiante ve su evolución por materia.

## Fuera de alcance

- Cambios en la API del backend.

## Supuestos

- A1: Las series por materia ya llegan en el provider actual.
  - impacto: alto

## Criterios de aceptación

- AC1: CUANDO el estudiante elige "Histórico anual" ENTONCES el gráfico muestra un punto por mes.

## Archivos

- modificar lib/features/home/home_estudiante_provider.dart — modelo multiserie

## Tareas

- [ ] T1: Modelo multiserie
  - files: lib/features/home/home_estudiante_provider.dart
  - ac: AC1
  - verify: flutter test test/features/home
