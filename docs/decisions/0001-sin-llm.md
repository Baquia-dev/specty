# 0001 · Specty no invoca modelos (por ahora)

- Estado: aceptada
- Fecha: 2026-10-20

## Contexto

Specty se usa dentro del chat del agente de cada persona (Claude Code, Cursor, Codex, Antigravity…). Exigir una clave de API ataría la herramienta a un proveedor, añadiría costes y fricción, y duplicaría el modelo que la persona ya eligió.

## Decisión

Specty nunca llama a modelos de lenguaje.

- Lo que requiere criterio lo hace el agente de la persona, guiado por los protocolos que devuelven los comandos de Specty: redactar specs y retro-specs, atender comentarios, clasificar ajustes y redactar el cierre.
- Specty se limita a lo determinista: validar, decidir transiciones, comprobar el alcance, ejecutar verificaciones, hacer commits y registrar.

## Consecuencias

- Funciona con cualquier agente que ejecute comandos de terminal, sin configurar proveedores.
- Un hook de git no puede generar una retro-spec por sí solo: bloquea y guía hacia el agente, o hacia el modo `minimal` si está activado.
- El CI verifica, pero no redacta.
- Si en el futuro hace falta generar contenido sin agente (por ejemplo, en el CI), se añadirá un proveedor opcional en un ADR nuevo, sin convertirlo en requisito.
