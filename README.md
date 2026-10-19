# UniFlow

Asistente académico móvil para iPhone: captura texto, fotos, audios y documentos de clase; la nube los transcribe, clasifica y convierte en tareas, sesiones de estudio y recordatorios, siempre con revisión del estudiante.

Expo / React Native + Express + tRPC + MySQL (Drizzle), sobre el starter administrado de Manus.

## Puesta en marcha

```bash
pnpm install
pnpm db:push          # genera y aplica las migraciones de drizzle/ (requiere DATABASE_URL)
pnpm dev              # servidor (3000) + Metro (8081)
```

Variables del servidor (las inyecta Manus en producción):

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | MySQL |
| `JWT_SECRET` / `MANUS_JWT_SECRET`, `VITE_APP_ID` / `MANUS_PROJECT_ID`, `OAUTH_SERVER_URL` | Sesión y OAuth de Manus |
| `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY` | Almacenamiento de archivos, IA (LLM) y transcripción |

Sin las claves de IA la app funciona en **modo básico**: un clasificador heurístico en español (`shared/capture-parser.ts`) sugiere tipo, fecha, materia y prioridad, y el chat responde con reglas sobre los datos guardados.

## Tarea programada

`POST /api/scheduled/reminders` (identidad cron de Manus) marca como entregados los avisos que llegaron a su hora y, si una fecha límite pasó sin “Ya está hecho”, marca la tarea como **vencida** y detiene sus recordatorios. Programarla cada 15 minutos.

## Comprobaciones

```bash
pnpm check   # TypeScript
pnpm lint
pnpm test    # unitarias; la prueba de extremo a extremo se activa con TEST_DATABASE_URL
TEST_DATABASE_URL=mysql://usuario:clave@localhost:3306/uniflow pnpm test
```

## Mapa del código

- `server/planner.ts` — motor de prioridad y carga diaria, sesiones progresivas y secuencia de recordatorios (funciones puras).
- `server/db.ts` — acceso a datos; toda consulta filtra por `userId` y verifica pertenencia.
- `server/routers.ts` — API tRPC: bandeja de revisión, tareas, plan, recordatorios, notas, chat, ajustes y exportación.
- `server/ai.ts` — clasificación, extracción de fotos/documentos, transcripción, resúmenes y chat con acciones propuestas.
- `shared/tz.ts` — fechas en la zona horaria del estudiante (el servidor corre en UTC).
- `app/` — pantallas: Hoy, Tareas (lista y semana), Capturar + revisión, Chat, Materias, detalle de tarea/materia/nota y Ajustes.
- `lib/notifications.ts` — notificaciones locales con acciones “Ya está hecho”, “Posponer” y “Ver plan”.

## Decisiones

- La IA **nunca** crea tareas por sí sola: las capturas quedan en la bandeja y las acciones del chat que cambian datos se confirman con un toque.
- La carga de estudio depende de complejidad, urgencia, tareas acumuladas y pasos restantes; la disponibilidad semanal solo limita choques.
- Los archivos se guardan bajo `uniflow/<userId>/` y solo su dueño puede abrirlos (enlaces firmados temporales).
- Eliminar una nota o tarea es lógico (`deletedAt`); la exportación JSON/Markdown/iCalendar está en Ajustes.
