---
kind: standard
---

# indicador de loading en acciones y cambios de estado

## Objetivo

Proporcionar retroalimentación visual inmediata con indicadores de carga (spinners y deshabilitación durante peticiones) en los botones y acciones de confirmación y cambio de estado de la interfaz de usuario (supuestos, revisión, cierre y comentarios), eliminando la percepción de que la aplicación queda congelada mientras se comunican las operaciones con el servidor.

## Fuera de alcance

- Cambios de protocolo de red o endpoints del backend.
- Animaciones complejas o transiciones de página completas.
- Indicadores de carga para navegación o lectura pasiva.

## Supuestos

- A1: El componente `Button` y `IconButton` pueden admitir un input reactivo `loading` que renderiza un spinner de Lucide animado con CSS y deshabilita la pulsación mientras está activo.
  - impacto: alto
- A2: El icono `Loader2` de Lucide está disponible en la dependencia `@lucide/angular` / `lucide` del proyecto.
- A3: Las acciones asíncronas en `AssumptionRow`, `ReviewActions`, `ClosingActions` y `ReviewComments` pueden gestionar localmente una señal de carga que dura mientras la promesa de la acción está pendiente.

## Criterios de aceptación

- AC1: CUANDO un botón tiene activada la propiedad `loading` ENTONCES muestra un spinner animado, queda deshabilitado para evitar pulsaciones múltiples y tiene el atributo `aria-busy="true"`.
- AC2: CUANDO el usuario pulsa «Confirmar» en un supuesto ENTONCES el botón pasa a estado de carga durante la ejecución de la petición y no permite interactuar hasta que finaliza.
- AC3: CUANDO el usuario pulsa «Aprobar revisión» o «Pedir cambios» en la barra de revisión ENTONCES el botón correspondiente muestra el indicador de carga mientras la operación está en curso.
- AC4: CUANDO el usuario confirma el cierre en «Confirmar y archivar» ENTONCES el botón muestra el indicador de carga durante el proceso de guardado y archivado.
- AC5: CUANDO el usuario añade, edita o elimina un comentario ENTONCES el botón de acción correspondiente refleja el estado de carga mientras se completa la operación en el almacén de datos.

## Archivos

- modificar packages/ui/src/components/icons.ts — exportar icono Loader2 de Lucide
- modificar packages/ui/src/components/icons.test.ts — actualizar conteo de iconos a 54
- modificar packages/ui/src/components/button.ts — soporte de input loading con spinner accesible
- modificar packages/ui/src/components/button.test.ts — pruebas del estado loading en Button e IconButton
- modificar packages/ui/src/review/assumption-row.ts — estado de carga en confirmación y rechazo de supuestos
- modificar packages/ui/src/review/spec-sections.test.ts — pruebas de indicador de carga al confirmar supuestos
- modificar packages/ui/src/review/review-actions.ts — estado de carga en botones de aprobar y pedir cambios
- modificar packages/ui/src/review/review-actions.test.ts — pruebas de indicador de carga en review actions
- modificar packages/ui/src/acceptance/closing-actions.ts — estado de carga en confirmación de cierre
- modificar packages/ui/src/acceptance/closing-actions.test.ts — pruebas de indicador de carga en confirmación de cierre
- modificar packages/ui/src/review/comments.ts — estado de carga en creación, edición y borrado de comentarios
- modificar packages/ui/src/review/comments.test.ts — pruebas de indicador de carga en comentarios

## Tareas

- [x] T1: Icono y soporte de loading en componentes de botón
  - files: packages/ui/src/components/icons.ts, packages/ui/src/components/button.ts, packages/ui/src/components/button.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/components/button.test.ts
- [x] T2: Indicadores de carga en confirmación de supuestos
  - files: packages/ui/src/review/assumption-row.ts, packages/ui/src/review/spec-sections.test.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/review/spec-sections.test.ts
- [x] T3: Indicadores de carga en acciones de revisión y cierre
  - files: packages/ui/src/review/review-actions.ts, packages/ui/src/review/review-actions.test.ts, packages/ui/src/acceptance/closing-actions.ts, packages/ui/src/acceptance/closing-actions.test.ts
  - ac: AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/review/review-actions.test.ts --include src/acceptance/closing-actions.test.ts
- [x] T4: Indicadores de carga en gestión de comentarios
  - files: packages/ui/src/review/comments.ts, packages/ui/src/review/comments.test.ts
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/review/comments.test.ts
- [x] T5: Actualizar conteo de iconos en prueba de regresión
  - files: packages/ui/src/components/icons.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/components/icons.test.ts
  - type: fix

## Cierre

### Resumen

Se implementó el indicador de carga (`loading`) en las acciones y cambios de estado de la interfaz de usuario:
- Se añadió el icono `LucideLoader2` y soporte del estado `loading` con animación giratoria (`animate-spin`), atributo de accesibilidad `aria-busy="true"` y deshabilitación contra pulsaciones múltiples en `Button` e `IconButton`.
- Se integró el estado de carga en la confirmación y rechazo de supuestos (`AssumptionRow` y `RejectAssumption`), deshabilitando las acciones opuestas mientras se procesa la petición.
- Se incorporaron indicadores de carga en las acciones globales de revisión («Aprobar revisión» y «Pedir cambios») y en la confirmación de cierre («Confirmar y archivar»).
- Se añadieron estados de carga en la adición, edición y eliminación de comentarios en `ReviewComments`.
- Se actualizó el conteo de iconos en `icons.test.ts` de 53 a 54 mediante ajuste y tarea T5.

### Desviaciones

- Se requirió un ajuste (`specty adjust`) tras la fase de aceptación para añadir la tarea T5 y actualizar la prueba de regresión `icons.test.ts` por la adición de `LucideLoader2`.
- Se solicitó el desbloqueo (`specty scope add`) de los archivos de prueba `spec-sections.test.ts`, `closing-actions.test.ts`, `review-actions.test.ts`, `comments.test.ts` e `icons.test.ts` para adaptar pruebas preexistentes y reflejar las llamadas asíncronas de los nuevos estados de carga.

### Decisiones

- Se utilizó el icono estándar `LucideLoader2` con clase `animate-spin` para mantener consistencia con los tokens de diseño y evitar añadir dependencias externas.
- Durante las peticiones asíncronas de confirmación o rechazo de supuestos, ambas acciones se bloquean mutuamente para evitar condiciones de carrera o pulsaciones dobles contradictorias.
- Las promesas pendientes se gestionan con señales locales booleanas (`loading`, `loadingConfirm`, `loadingApprove`, etc.) que se restablecen al resolverse o fallar la acción.

### Pendientes

- Ninguno. Todas las operaciones asíncronas de cambios de estado identificadas cuentan con respuesta visual inmediata de carga y accesibilidad mediante `aria-busy`.
