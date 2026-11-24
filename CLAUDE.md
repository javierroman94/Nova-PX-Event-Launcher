# Nova PX Event Launcher — reglas para trabajar en este repositorio

Este repositorio es **público**. Todo lo que se suba lo puede leer cualquiera, y quien tome el repositorio o la cuenta de administrador puede intentar repartir código a todos los jugadores. Trabaja con eso en mente.

## Mensajes de commit (obligatorio)

- Una sola línea, en español, de **máximo 65 caracteres**, que diga exactamente qué cambió.
- **Prohibido** el formato Conventional Commits: nada de `feat(auth): ...`, `fix(ui): ...` ni `chore(deps): ...`.
- **Prohibidos** los títulos inflados, robóticos o con jerga artificial. Nada de listas eternas en el título.
- Si hace falta detallar, va en el cuerpo del commit con viñetas breves, nunca en el título.
- Ejemplos correctos:
  - `Cifra los tokens de sesion con safeStorage de Electron`
  - `Elimina llaves expuestas en la configuracion del worker`
  - `Agrega validacion SHA-256 al instalar packs de eventos`

## Seguridad (obligatorio)

### Secretos y repositorio
- Nunca se suben al repositorio: tokens, claves de API, webhooks, contraseñas, llaves privadas, `.env` ni `.dev.vars`. El `.gitignore` ya bloquea `*.PRIVADA.pem`, `*.key.pem`, `.env` y `.dev.vars`.
- Los secretos del Worker viven en Cloudflare (`wrangler secret put ADMIN_KEY`, `ANTHROPIC_KEY`), nunca en `wrangler.jsonc` ni en el código.
- Antes de cada commit revisa el diff buscando claves, URLs privadas y datos personales.
- `config/launcher.config.json` es público: solo configuración, jamás credenciales.

### Cuentas y sesión
- El login premium usa solo el OAuth oficial de Microsoft. El launcher **nunca** pide ni maneja contraseñas.
- Los tokens de Microsoft, Xbox y Minecraft **nunca** salen de la máquina hacia el Worker, telemetría, logs ni informes. Lo que se envía al Worker es solo: id de instalación aleatorio, nick, si es premium, versión y sistema.
- Los tokens en disco se guardan con `safeStorage` a través de `lib/secure-storage.js`. Si no hay almacén seguro (en Linux, el respaldo `basic_text` no cuenta), **no se guardan**: no hay respaldo en texto plano ni llaves fijas.
- Todo texto que vaya a la consola o a un informe pasa por `lib/redact.js`. minecraft-launcher-core imprime los argumentos del juego con el token de acceso.

### Cifrado y descargas
- Nunca llaves hardcodeadas. Los eventos protegidos usan una llave derivada de la contraseña (scrypt) con AES-256-GCM; los sobres nuevos usan `KDF_STRONG` y guardan sus parámetros en `kdf`.
- Los informes de eventos protegidos se sellan con la llave pública de `config/soporte-informes.pub.pem`. La privada no está en el repositorio; se abre con `node tools/abrir-informe.js`.
- Todo mod o archivo descargado se verifica con su huella (`sha1` obligatorio en `lib/pack-install.js`) y solo se aceptan enlaces `https`. Prefiere SHA-256 en cualquier formato nuevo.
- `manifest`, `plugins`, `recommended` y `launcher` de `data/` se firman con Ed25519 (`lib/firma.js`). La llave privada (`firma-datos.PRIVADA.pem`) nunca va al repositorio. Si editas esos archivos a mano, corre `node tools/firmar-datos.js llave.PRIVADA.pem`; publicando desde el launcher se firman solos. Ver `docs/SEGURIDAD.md`.

### Electron
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity` activo en **toda** ventana propia.
- La CSP de `renderer/index.html` no admite `unsafe-inline` ni `unsafe-eval` en scripts. No agregues scripts ni estilos en línea.
- Toda ventana propia pasa por `lockWindow()` en `main.js` (sin navegación fuera de `renderer/`, sin `<webview>`). Los enlaces externos solo se abren si son `https` (`link:open`, `setWindowOpenHandler`).
- Los canales IPC se registran con `ipcMain.handle`, que ya filtra por origen (`lib/ipc-guard.js`). **Valida todos los parámetros** en el handler: tipos, longitudes, formato de ids y rutas. Nunca construyas una ruta con un valor del renderer sin comprobar que queda dentro de su carpeta.
- Lo que viene de internet (manifests, nombres de mods, textos) se trata como no confiable: se sanea al leer. En el renderer usa `textContent`; evita `innerHTML` con datos externos.
- Los comandos previos y posteriores (`preLaunch`, `postExit`) son solo de este equipo: nunca viajan en un modpack exportado ni importado.

### Worker de Cloudflare
- Las rutas administrativas exigen `ADMIN_KEY` (secreto) y tienen bloqueo tras intentos fallidos. Las rutas públicas tienen límite de peticiones (`worker/limit.mjs`).
- Nada que escriba en KV sin límite ni sin validar el contenido.
- Se puede añadir el binding opcional `LIMITER` (Rate Limiting de Cloudflare) sin cambiar el código.

### Dependencias
- Revisa `npm audit --omit=dev` antes de publicar. Las vulnerabilidades actuales vienen de `minecraft-launcher-core` (usa `request` y `adm-zip`) y no tienen arreglo sin cambiar de dependencia; no uses `npm audit fix --force` sin probar el juego completo.

## Trabajo diario

- Pruebas: `npm test`. Estilo: `npm run lint` (hoy 13 advertencias, ningún error). Arranque simulado: `npm run smoke`.
- Publicar una versión: sube la versión en `package.json` y `package-lock.json`, agrega la entrada en `CHANGELOG.md` (`## 1.0.X`, en español), fusiona en `main` y crea la etiqueta `vX`. El flujo "Publicar versión" se dispara con el push a `main`. **Solo se publica cuando el dueño lo pide.**
- Español informal en la interfaz y en los mensajes. El dueño no tiene máquina de desarrollo: se prueba con las pruebas y capturas automatizadas.
