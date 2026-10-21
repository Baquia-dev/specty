# 0002 · Formato de spec propio, con exportadores

- Estado: aceptada
- Fecha: 2026-10-20

## Contexto

El legacy delegaba el ciclo de specs en OpenSpec 1.14.1: cinco archivos por cambio (proposal, design, tasks, verification, handoff) y la gramática ADDED/MODIFIED/REMOVED. Eso añadía verbosidad, limitaba la validación y la UI a un formato ajeno, y ataba Specty a la evolución de un tercero.

## Decisión

- Un solo `spec.md` por cambio, con secciones fijas por carril, ítems con id estable (`A1`, `AC1`, `T1`…) y una sintaxis de tareas parseable. El estado vive aparte, en `state.json` ([formats.md](../formats.md)).
- Exportadores a OpenSpec, GitHub Spec Kit y Kiro, e importador desde OpenSpec para quienes vienen del legacy.

## Consecuencias

- Hay que mantener un parser, un serializador y un validador propios en `@baquia-dev/specty-core`.
- La v1 no mantiene "specs vivas" consolidadas por capacidad. El conocimiento durable queda en la sección Cierre y en los documentos del proyecto (ARCHITECTURE, ADR), que el agente propone actualizar al cerrar.
- Cada exportador debe seguir la evolución de su formato de destino.
