# Publicar en Microsoft Store

La Store firma el paquete con el certificado de Microsoft, así que a los jugadores **no les sale la alerta de SmartScreen**. El registro de desarrollador individual es gratuito.

## 1. Crear la cuenta (la haces tú, una sola vez)
1. Entra a [Partner Center](https://partner.microsoft.com/dashboard/registration) y regístrate como **desarrollador individual**.
2. Verifica tu identidad como te lo pida Microsoft.

## 2. Reservar la app
1. Partner Center → **Aplicaciones y juegos → Nueva aplicación → MSIX o PWA**.
2. Reserva el nombre **Nova PX Event Launcher**.
3. Abre la app → **Gestión de productos → Identidad del producto** y copia estos tres datos:
   - `Package/Identity/Name`
   - `Package/Identity/Publisher` (empieza por `CN=`)
   - `Package/Properties/PublisherDisplayName`

## 3. Generar el paquete
1. GitHub → **Actions → Paquete para Microsoft Store → Run workflow**.
2. Pega los tres datos y ejecuta. Al terminar, descarga el artefacto `nova-px-msix` (archivo `.appx`).

## 4. Enviarlo
1. En Partner Center crea el **envío**: sube el `.appx`, la descripción, capturas (las de `docs/img/`), clasificación por edades y la política de privacidad (`PRIVACY.md` publicada en GitHub).
2. Envía a certificación. Suele tardar unos días.

## Notas
- En la versión de la Store las **actualizaciones las hace la Store**; el actualizador de GitHub se desactiva solo.
- Los jugadores pueden seguir usando el instalador `.exe` de GitHub Releases.
- Cada versión nueva en la Store requiere repetir el paso 3 y un nuevo envío.
