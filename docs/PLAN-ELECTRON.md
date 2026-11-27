# Plan para subir Electron 33 → 44/45

Estado: **solo plan, no aplicado.** Electron 33.4.11 sigue en `package.json`. No se usa `npm audit fix --force`: cambiaría versiones sin control ni pruebas.

## Por qué
`npm audit` completo marca 46 avisos de Electron 33 (12 altos), entre ellos un bypass de aislamiento de contexto (GHSA-h7rp-cf8h-j98x). Electron se distribuye a cada jugador, aunque esté en `devDependencies`. Hoy Electron da soporte a 43, 44 y 45. Tanto `44.11.6` como `45.5.0` corrigen esos avisos.

**Destino recomendado:** primero `44.x` (más rodada) y, cuando 44 esté estable en jugadores, `45.x`. Cada salto en su propia rama y su propio PR.

## Cambios incompatibles que afectan al launcher (revisados el 27-11-2026)
| Versión | Cambio | Qué pasa en Nova PX |
|---|---|---|
| 45 | Los preloads con sandbox ya no tienen `Buffer`, `setImmediate`, `clearImmediate` ni shims de módulos de Node | `preload.js` solo usa `contextBridge`, `ipcRenderer` y `webUtils` de `electron`. Compatible; confirmarlo al probar |
| 44 | Workers creados por subframes necesitan `nodeIntegrationInSubFrames` | No se usan: sin cambios |
| 42 | El paquete `electron` ya no se descarga solo con `postinstall` | Revisar `npm ci` en CI y `npm start`; `electron-builder` baja su propio Electron al compilar |
| 40 | Se depreca el `clipboard` de Electron en el renderer | El renderer no lo usa: sin cambios |
| 36 | `app.commandLine` pasa los switches a minúsculas | `main.js` no agrega switches: sin cambios |

La lista completa está en https://www.electronjs.org/docs/latest/breaking-changes y hay que releerla al hacer el cambio, porque se actualiza.

## Pasos
1. Rama `revision-electron-44` desde la rama con todas las correcciones (después de #9, #11 y #12).
2. `npm install --save-dev electron@44.11.6`. Comprobar con `npm ls` que solo cambian `electron` y lo suyo (`extract-zip`, `@electron/get`).
3. Ajustar CI: las pruebas del launcher usan hoy Node 20, que es el de Electron 33. Pasarlas a la versión de Node que trae Electron 44 (ver su nota de versión) y mantener `pruebas-windows`.
4. `npm ci`, `npm test`, `npm run lint`, `npm run smoke`, `npm audit` y `npm audit --omit=dev`.
5. Compilar con `electron-builder --win nsis --publish never` y `--linux dir`.
6. Pruebas manuales en Windows (`docs/PRUEBAS-WINDOWS.md`) sobre una instalación que venga de la 1.0.193, **sin borrar los datos**:
   - Login Microsoft (`msmc` abre una ventana de Electron): nuevo, renovación y cancelación.
   - `safeStorage`: las cuentas, `presence.token`, `admin.token`, `firma-datos.key` y `discord.hook` guardados con Electron 33 deben seguir abriéndose. Si no abren, se pierde la sesión de todos.
   - Barra de título propia (`titleBarOverlay`), ventana flotante de PX y modo bandeja.
   - Enlaces externos (`link:open`, `window.open`) y la confirmación de dominios.
   - Auto-actualización de 1.0.193 a la versión nueva, y otra vez a la siguiente.
   - Instalar y abrir Minecraft: Vanilla, Fabric (también un evento protegido con `.px`), Forge y NeoForge.
   - Duplicar instancia sin mundos e importar modpacks: el arreglo de `lib/ruta-relativa.js` debe seguir funcionando con el Node nuevo.
   - Discord Rich Presence (named pipes).
7. Publicar solo cuando el dueño lo pida, primero a pocos jugadores si es posible.

## Si algo falla
Volver a la versión anterior en el mismo PR (`npm install --save-dev electron@33.4.11`) y abrir un issue con lo que falló. Si una versión ya publicada no abre `safeStorage`, no se puede deshacer en los PCs de los jugadores: por eso esa prueba va antes de publicar.
