---
kind: standard
dependsOn: []
---
# Mi evolución académica
<!-- Pista: un título corto -->

## Supuestos
* a1: Las series por materia ya llegan en el provider actual.
    - Impacto: Alto

## Objetivo:
El estudiante ve su evolución por materia.   
<!-- 1–3 frases:
     qué cambia para el usuario -->

## fuera de alcance
- Cambios en la API del backend.

## criterios de aceptacion
- ac1: CUANDO el estudiante elige "Histórico anual"
  ENTONCES el gráfico muestra un punto por mes.

## Tareas
- T1: Modelo multiserie
  - files: `lib/features/home/home_estudiante_provider.dart`
  - ac: ac1
  - verify: `flutter test test/features/home`

## Archivos
- Modificar ./lib/features/home/home_estudiante_provider.dart - modelo multiserie
