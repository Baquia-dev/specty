// SPDX-License-Identifier: Apache-2.0
// Specs of the sample project "Mi colegio" (a school app), in the real spec.md format.

const spec = (title: string, body: string, kind = "standard") =>
  `---\nkind: ${kind}\n---\n\n# ${title}\n\n${body.trim()}\n`;

export const SAMPLE_SPECS: Readonly<Record<string, string>> = {
  "20261020-evolucion-trimestre": spec(
    "Agrupar la evolución académica por trimestre",
    `
## Objetivo

El estudiante ve su evolución por materia agrupada por trimestre, con una línea por materia.

## Fuera de alcance

- La vista del docente.

## Supuestos

- A1: Las series por materia ya llegan del backend; no hace falta cambiar la API.
  - impacto: alto
- A2: Un trimestre son los periodos académicos del colegio, no meses naturales.
  - impacto: alto
- A3: Basta con el componente de gráfico actual.

## Criterios de aceptación

- AC1: CUANDO el estudiante elige "Por trimestre" ENTONCES ve un punto por trimestre y materia.
- AC2: CUANDO toca una materia de la leyenda ENTONCES su línea se oculta o se muestra.
- AC3: El gráfico carga rápido.

## Diseño

El proveedor agrupa las notas por **periodo académico** y el gráfico dibuja una línea por materia.

- La agrupación vive en \`EvolutionProvider\`, no en el widget.
- La leyenda reutiliza \`SubjectChip\`.

\`\`\`dart
final byTerm = groupBy(grades, (grade) => grade.term);
\`\`\`

## Archivos

- modificar lib/home/evolution_provider.dart — agrupación por trimestre
- modificar lib/analytics/evolution_card.dart — selector y leyenda
- crear test/analytics/evolution_card_test.dart — pruebas del widget

## Tareas

- [ ] T1: Agrupar las series por trimestre
  - files: lib/home/evolution_provider.dart
  - ac: AC1
  - verify: flutter test test/home
- [ ] T2: Selector de periodo y leyenda interactiva
  - files: lib/analytics/evolution_card.dart, test/analytics/evolution_card_test.dart
  - ac: AC1, AC2, AC3
  - verify: flutter test test/analytics
`,
  ),
  "20261019-boletines-pdf": spec(
    "Exportar boletines en PDF",
    `
## Objetivo

El docente descarga el boletín de cada estudiante en PDF, listo para imprimir.

## Fuera de alcance

- El envío por correo.

## Supuestos

- A1: El logotipo del colegio está en los recursos de la app.

## Criterios de aceptación

- AC1: CUANDO el docente pulsa "Descargar PDF" ENTONCES obtiene un PDF con notas y observaciones.

## Archivos

- crear lib/reports/pdf/report_card.dart — composición del PDF
- modificar lib/reports/report_screen.dart — botón de descarga

## Tareas

- [x] T1: Composición del PDF
  - files: lib/reports/pdf/report_card.dart
  - ac: AC1
- [x] T2: Botón de descarga
  - files: lib/reports/report_screen.dart
  - ac: AC1
- [ ] T3: Pie de página con firma
  - files: lib/reports/pdf/report_card.dart
  - ac: AC1
`,
  ),
  "20261018-asistencia-curso": spec(
    "Panel de asistencia por curso",
    `
## Objetivo

El coordinador ve la asistencia semanal de cada curso y los estudiantes con más ausencias.

## Fuera de alcance

- Justificar ausencias desde el panel.

## Supuestos

- Ninguno

## Criterios de aceptación

- AC1: CUANDO el coordinador abre el panel ENTONCES ve el porcentaje semanal por curso.
- AC2: CUANDO un estudiante supera tres ausencias en la semana ENTONCES aparece destacado.

## Archivos

- crear lib/attendance/course_panel.dart — panel
- modificar lib/attendance/attendance_repository.dart — agregados semanales

## Tareas

- [x] T1: Agregados semanales
  - files: lib/attendance/attendance_repository.dart
  - ac: AC1
- [x] T2: Panel con estudiantes destacados
  - files: lib/attendance/course_panel.dart
  - ac: AC1, AC2
`,
  ),
  "20261017-recordatorios-correo": spec(
    "Recordatorios de tareas por correo",
    `
## Objetivo

Las familias reciben un correo el día anterior a la entrega de cada tarea.

## Fuera de alcance

- Notificaciones push.

## Supuestos

- Ninguno

## Criterios de aceptación

- AC1: CUANDO falta un día para una entrega ENTONCES la familia recibe un correo con la tarea.

## Archivos

- crear lib/notifications/reminder_job.dart — tarea programada

## Tareas

- [x] T1: Tarea programada de recordatorios
  - files: lib/notifications/reminder_job.dart
  - ac: AC1

## Cierre

### Resumen

Las familias reciben un correo el día anterior a cada entrega. Una tarea programada recorre a las 18:00 las entregas del día siguiente y encola un correo por familia, con la tarea y su fecha.

### Desviaciones

- **La cola existente en lugar de una nueva:** los correos van por la cola de notificaciones que ya usan los boletines; no hizo falta un servicio aparte.

### Decisiones

- **Un correo por familia y día:** si un estudiante tiene varias entregas, van juntas en el mismo correo.
- **Sin reintentos propios:** la cola ya reintenta tres veces; un fallo final queda en su registro.

### Pendientes

- **La plantilla en inglés:** hoy los correos salen solo en español.
- **Darse de baja:** falta un enlace para que una familia deje de recibirlos.
`,
  ),
  "20261021-login-google": spec(
    "Login con Google",
    `
## Objetivo

Docentes y familias entran con su cuenta de Google.

## Fuera de alcance

- Otros proveedores.

## Supuestos

- Ninguno

## Criterios de aceptación

- AC1: CUANDO alguien pulsa "Entrar con Google" ENTONCES entra con su cuenta si está registrada.

## Archivos

- modificar lib/auth/login_screen.dart — botón
- crear lib/auth/google_provider.dart — proveedor

## Tareas

- [x] T1: Proveedor de Google
  - files: lib/auth/google_provider.dart
  - ac: AC1
- [ ] T2: Botón en la pantalla de entrada
  - files: lib/auth/login_screen.dart
  - ac: AC1
`,
  ),
  "20261021-modo-oscuro": spec(
    "Modo oscuro en la app",
    `
## Objetivo

La app respeta el tema oscuro del teléfono.
`,
    "quick",
  ),
  "20261015-redondeo-promedios": spec(
    "Corregir el redondeo de promedios",
    `
## Objetivo

Los promedios se redondean a una cifra decimal, como en el boletín oficial.

## Archivos

- modificar lib/grades/average.dart — redondeo

## Tareas

- [x] T1: Redondeo a una cifra
  - files: lib/grades/average.dart
`,
    "quick",
  ),
  "20261014-chat-docentes": spec(
    "Chat entre docentes",
    `
## Objetivo

Los docentes conversan dentro de la app.
`,
  ),
};
