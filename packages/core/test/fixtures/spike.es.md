---
kind: spike
timebox: 2h
---

# Evaluar la librería de gráficos

## Pregunta

¿fl_chart permite leyendas interactivas y nodos personalizados sin hacer un fork?

## Fuera de alcance

- Integrar la librería en la app.

## Supuestos

- Ninguno

## Archivos

- crear spikes/charts/main.dart — prototipo desechable

## Tareas

- [ ] T1: Prototipo con fl_chart
  - files: spikes/charts/main.dart
  - verify: flutter analyze spikes/charts

## Cierre

### Hallazgos

fl_chart cubre leyendas y nodos personalizados con `FlDotPainter`.

### Decisión

Usar fl_chart; se abre una spec de seguimiento para integrarlo.
