---
kind: standard
---

# Mi evolución académica

## Objetivo

El estudiante ve su evolución por materia en un gráfico de líneas con filtro temporal, leyenda interactiva y un mensaje de tendencia.

## Fuera de alcance

- Cambios en la API del backend.
- La vista del docente.

## Supuestos

- A1: Las series por materia ya llegan en el provider actual; no hace falta cambiar la API.
  - impacto: alto
- A2: "Por periodo" agrupa por trimestres académicos.

## Criterios de aceptación

- AC1: CUANDO el estudiante elige "Histórico anual" ENTONCES el gráfico muestra un punto por mes para cada materia.
- AC2: CUANDO el estudiante toca un chip de la leyenda ENTONCES esa serie se oculta o se muestra sin recargar la vista.

## Archivos

- modificar lib/features/home/home_estudiante_provider.dart — modelo multiserie y filtro temporal
- modificar lib/features/analytics/analytics_estudiante_dashboard_cards.dart — rediseño de la tarjeta
- crear test/features/analytics/evolucion_card_test.dart — pruebas de widget

## Tareas

- [ ] T1: Modelo multiserie y filtro temporal
  - files: lib/features/home/home_estudiante_provider.dart
  - ac: AC1
  - verify: flutter test test/features/home
- [ ] T2: Rediseñar la tarjeta de evolución
  - files: lib/features/analytics/analytics_estudiante_dashboard_cards.dart, test/features/analytics/evolucion_card_test.dart
  - ac: AC1, AC2
  - verify: flutter test test/features/analytics

## Riesgos

- R1: Con 12 puntos y 4 series, el gráfico puede desbordar en pantallas pequeñas. Mitigación: probarlo a 320 px de ancho.
