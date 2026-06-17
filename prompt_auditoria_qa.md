# Prompt de auditoría QA (genérico) para Claude Code

## Contexto (rellena estas líneas antes de pegar; si no estás seguro de algo, escribe "descúbrelo tú")
- **Proyecto:** [qué hace la app en 1-2 frases; trata temas de fiscalidad].
- **Stack / arquitectura:** [lenguajes, framework(s), si hay backend, base de datos, etc. — o "descúbrelo tú" y deja que lo mapee].
- **Áreas críticas:** la exactitud de los cálculos fiscales es prioritaria; un error numérico cuenta como fallo grave. Añade cualquier otra zona sensible (datos, pagos, autenticación…).
- **Cómo arrancar/probar:** [comando para instalar y ejecutar, si lo conoces; p. ej. `npm install && npm run dev`].

## Rol y objetivo
Actúa como ingeniero senior de QA y revisión de código. Audita este proyecto de arriba a abajo para encontrar **todos** los fallos, inconsistencias, riesgos y puntos débiles, y entregarme un informe priorizado. No asumas que nada funciona: verifícalo. Si algo no puedes comprobarlo de forma estática, dímelo y explícame cómo probarlo yo manualmente.

## Metodología (por fases)
1. **Reconocimiento.** Antes de juzgar nada, mapea el proyecto: estructura de carpetas, ficheros de configuración y dependencias (`package.json`, `requirements.txt`, etc.), README, puntos de entrada y cómo se arranca. Dime qué stack y arquitectura has detectado.
2. **Inventario.** Lista los módulos/componentes, los flujos de usuario principales, las entradas y salidas, y dónde vive la lógica fiscal y los datos. Propón una división en módulos para auditar.
3. **Auditoría módulo a módulo.** Profundiza en cada bloque por separado siguiendo la lista de abajo.
4. **Verificación de cálculos.** No te fíes de leer el código: traza valores concretos a mano y, cuando se pueda, **extrae las funciones de cálculo y escríbeles tests que ejecutes de verdad**, con casos conocidos y casos límite. Reporta los resultados reales.
5. **Informe.** Antes de tocar nada, entrégame primero el informe. No apliques correcciones sin confirmármelo.

Trabaja por fases y haz *checkpoints* conmigo si el proyecto es grande. Dime el plan antes de empezar y espera mi visto bueno.

## Qué revisar
1. **Correctitud funcional** — recorre cada flujo y comprueba que cada parte hace lo que dice.
2. **Exactitud de cálculos (crítico)** — recalcula de forma independiente; redondeos, orden de operaciones, unidades; valores frontera de tramos/umbrales fiscales; prorrateos; periodos parciales; años bisiestos; divisiones por cero; entradas negativas o enormes; sumas que deben cuadrar (p. ej. repartos al 100 %).
3. **Casos límite y validación de entradas** — vacíos, cero, negativos, no numéricos, valores extremos, formatos con separadores (comas/puntos/€), fechas frontera, datos malformados.
4. **Gestión de estado y datos** — consistencia tras cada acción, datos obsoletos, condiciones de carrera.
5. **Persistencia / almacenamiento** — sea cual sea (base de datos, ficheros, API, `localStorage`): integridad al guardar y recuperar, migraciones cuando cambian los campos, datos corruptos o ausentes, transacciones, pérdidas de datos.
6. **Backend / API** (si existe) — validación en servidor, manejo de errores, códigos de estado, idempotencia, control de acceso.
7. **Seguridad** — validación y saneado de entradas, inyección (SQL, comandos), XSS, autenticación/autorización, secretos o credenciales en el repo, dependencias vulnerables, exposición de datos sensibles.
8. **Manejo de errores** — fallos controlados, sin excepciones silenciadas ni sin capturar, mensajes claros, logs útiles.
9. **UI/UX y accesibilidad** (si aplica) — maquetación, responsive, estados vacíos/carga/error, navegación por teclado, foco, etiquetas, contraste, ARIA.
10. **Rendimiento** — datasets grandes, consultas costosas, re-renders, fugas de memoria.
11. **Configuración, build y dependencias** — variables de entorno, build reproducible, dependencias desactualizadas o sin usar.
12. **Pruebas y consola** — cobertura de tests existente, tests que fallan, errores/avisos en consola o logs.
13. **Calidad de código** (prioridad menor) — código muerto, duplicación, números mágicos, TODO/FIXME, nombres, mantenibilidad.

## Formato del informe
Escribe el informe en `REPORTE_QA.md` con esta estructura:
- **Resumen ejecutivo:** estado general y recuento de hallazgos por severidad.
- **Hallazgos por módulo**, cada uno con: ID, severidad (Crítico / Alto / Medio / Bajo), ubicación (fichero/función/línea), descripción, pasos de reproducción, impacto y corrección sugerida.
- **Lista priorizada de acción:** qué arreglar primero.
- **Verificado correcto:** qué has comprobado y está bien.
- **Dudas y cosas que necesito de ti:** lo que no pudiste verificar y cómo probarlo manualmente.

Sé concreto: referencia fichero/función/línea y evita recomendaciones vagas del tipo "considera mejorar".
