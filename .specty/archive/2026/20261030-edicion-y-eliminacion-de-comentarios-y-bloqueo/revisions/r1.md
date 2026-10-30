---
kind: standard
---

# edicion y eliminacion de comentarios y bloqueo de aprobacion

## Objetivo

Permitir editar y eliminar comentarios en la revisión de la spec, deshabilitar las acciones de confirmación y rechazo en supuestos que tengan comentarios pendientes, y deshabilitar el botón de aprobar si existe al menos un comentario abierto, dejando como única opción válida pedir cambios.

## Fuera de alcance

- Historial de cambios o auditoría de revisiones pasadas sobre el texto editado de un comentario.
- Edición o eliminación de comentarios ya resueltos en revisiones anteriores.

## Supuestos

- A1: Solo los comentarios no resueltos pueden editarse o eliminarse en la interfaz durante la fase de revisión.
- A2: Un supuesto se considera comentado si existe al menos un comentario sin resolver anclado directamente a su identificador (`item: id`) o con cita de texto dentro de dicho supuesto; mientras esté comentado, sus botones de confirmar, rechazar y cambiar decisión se deshabilitan indicando el motivo.
- A3: Si existe al menos un comentario sin resolver en la spec, el botón de aprobar revisión se deshabilita indicando que hay comentarios abiertos, y la acción para pedir cambios permanece como la única opción disponible para avanzar.

## Criterios de aceptación

- AC1: CUANDO un usuario visualiza un comentario no resuelto en revisión ENTONCES se muestran acciones para editar su texto o eliminarlo.
- AC2: CUANDO un usuario edita el texto de un comentario y guarda ENTONCES el comentario actualiza su contenido en el almacén de datos.
- AC3: CUANDO un usuario elimina un comentario ENTONCES el comentario se elimina del almacén de datos y desaparece de la vista.
- AC4: CUANDO un supuesto tiene al menos un comentario sin resolver asociado ENTONCES sus acciones de confirmación, rechazo o cambio de decisión están deshabilitadas con un motivo descriptivo.
- AC5: CUANDO existe al menos un comentario sin resolver en la spec ENTONCES el botón de aprobar revisión está deshabilitado con su motivo de bloqueo y el botón de pedir cambios está habilitado.

## Diseño

- **Almacenamiento y flujo en CLI (`packages/cli`)**:
  - `flow/review.ts` añade `editComment` y `deleteComment` asegurando fase de revisión y actualizando `comments.json`.
  - `server/actions.ts` parsea rutas POST para editar y borrar comentarios, e impide `approveRevision` si existen comentarios sin resolver.
- **Capa de datos UI (`packages/ui/src/data`)**:
  - `SpectyData` en `source.ts` incorpora `editComment` y `deleteComment`.
  - `server.ts` y `fixtures.ts` implementan la persistencia real y en memoria.
- **Componentes UI (`packages/ui/src/review`)**:
  - `comments.ts`: añade botones de edición y borrado junto al comentario, así como controles inline para modificar el texto.
  - `assumption-row.ts`: recibe la lista de comentarios y desactiva `confirm`, `reject` y `reconsider` con `disabledReason` cuando el supuesto tiene comentarios sin resolver.
  - `spec-review.ts` y `delta-review.ts`: enlazan los comentarios con cada fila de supuesto.
  - `review-actions.ts`: incorpora la presencia de comentarios abiertos en el cálculo computado `blocked` de `why()`.

## Archivos

- modificar packages/cli/src/flow/review.ts — funciones editComment y deleteComment
- modificar packages/cli/src/server/actions.ts — parseo de acciones de comentario y verificación de comentarios en aprobación
- modificar packages/cli/src/server/actions.test.ts — pruebas de servidor para editar/borrar comentarios y bloqueo de aprobación
- modificar packages/ui/src/data/source.ts — métodos editComment y deleteComment en la clase base
- modificar packages/ui/src/data/server.ts — comunicación http para edición y borrado
- modificar packages/ui/src/data/fixtures.ts — soporte de edición y borrado en fixtures
- modificar packages/ui/src/data/fixtures.test.ts — pruebas de edición y borrado en fixtures
- modificar packages/ui/src/review/comments.ts — acciones y formulario inline para editar y borrar comentarios
- modificar packages/ui/src/review/comments.test.ts — pruebas de interacción de edición y borrado
- modificar packages/ui/src/review/assumption-row.ts — deshabilitación de acciones en supuestos comentados
- modificar packages/ui/src/review/spec-review.ts — suministro de comentarios a assumption-row
- modificar packages/ui/src/review/delta-review.ts — suministro de comentarios a assumption-row
- modificar packages/ui/src/review/review-actions.ts — bloqueo de botón aprobar con comentarios abiertos
- modificar packages/ui/src/review/review-actions.test.ts — pruebas de botón de aprobación deshabilitado con comentarios

## Tareas

- [ ] T1: Backend CLI: edición, borrado de comentarios y validación de aprobación
  - files: packages/cli/src/flow/review.ts, packages/cli/src/server/actions.ts, packages/cli/src/server/actions.test.ts
  - ac: AC2, AC3, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run src/server/actions.test.ts
- [ ] T2: Capa de datos UI: métodos editComment y deleteComment
  - files: packages/ui/src/data/source.ts, packages/ui/src/data/server.ts, packages/ui/src/data/fixtures.ts, packages/ui/src/data/fixtures.test.ts
  - ac: AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/fixtures.test.ts
- [ ] T3: Bloqueo de aprobación y acciones en supuestos con comentarios
  - files: packages/ui/src/review/review-actions.ts, packages/ui/src/review/assumption-row.ts, packages/ui/src/review/spec-review.ts, packages/ui/src/review/delta-review.ts, packages/ui/src/review/review-actions.test.ts
  - ac: AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/review/review-actions.test.ts --include src/review/spec-sections.test.ts
- [ ] T4: Interfaz de edición y eliminación de comentarios en ReviewComments
  - files: packages/ui/src/review/comments.ts, packages/ui/src/review/comments.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/review/comments.test.ts
