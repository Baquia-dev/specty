# 0010 · Modo delegado: la persona puede delegar sus decisiones en el agente

- Estado: aceptada
- Fecha: 2026-10-23

## Contexto

La [0006](0006-specty-gestiona-el-flujo.md) hizo exclusivamente humanas las transiciones que conceden permisos sobre el código: aprobar la spec, decidir el alcance, aceptar, cerrar y cancelar. Así, un agente impaciente no puede saltarse la revisión.

A veces, sin embargo, la persona prefiere que el agente avance solo en un repositorio. Hoy su única salida sería quitar los hooks, y con ellos también desaparecen el alcance de cada tarea, los commits de Specty y la auditoría.

## Decisión

- La persona puede delegar sus decisiones en el agente con un interruptor: el modo delegado. Mientras está activo, el agente ejecuta `approve` (también con `--scope`), `reject --scope`, `accept`, `close` y `cancel`, y las tarjetas le dicen que lo haga él en lugar de pedírselo al usuario.
- Solo la persona activa y desactiva el modo, desde su terminal (`specty delegate on|off`), después de leer una advertencia y confirmarla. El guard nunca deja al agente ejecutar `delegate`, y ninguna variable de entorno, flag ni campo de configuración lo activa. Fuera de este modo, la invariante de la 0006 sigue intacta.
- Vale para el clon entero, con todas sus worktrees. No se versiona, así que no llega a otros clones ni al equipo, y sigue activo hasta que la persona lo desactive.
- Cubre todas las decisiones de la persona:
  - al aprobar, se confirman los supuestos de impacto alto pendientes;
  - el alcance se decide también en las rutas sensibles;
  - `accept` ejecuta antes la verificación completa y no acepta si falla.
- Cada acción delegada queda en la auditoría como del agente, con una marca de delegación.

## Consecuencias

- Con el modo activo, Specty deja de garantizar que una persona revise cada spec y cada resultado. Lo demás se mantiene: la spec va antes del código, cada tarea tiene su alcance, los commits los hace Specty y todo queda en la auditoría.
- Las garantías fuertes siguen donde estaban ([ARCHITECTURE §10](../ARCHITECTURE.md#modelo-de-confianza)): el CI obligatorio y, en modo equipo, la revisión de PR.
- La auditoría distingue lo que decidió el agente de lo que decidió la persona.
- El bloque de AGENTS.md lo dice en una línea: el agente solo ejecuta esas acciones si `SIGUIENTE:` se lo pide.
