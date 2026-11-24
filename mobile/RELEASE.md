# Inventory Pro Mobile — Hardware, Push Notifications & Release Pipeline

## 1. Prerequisites
- Install dependencies inside `mobile/`:
  ```bash
  npm --prefix mobile install
  ```
- Authenticate with Expo EAS (for cloud builds & remote push tokens):
  ```bash
  cd mobile
  npx eas login
  npm run eas:init
  ```
  Running `eas init` populates `expo.extra.eas.projectId` inside `mobile/app.json`, enabling remote Expo Push Tokens and EAS Updates. You can also supply `EXPO_PUBLIC_EAS_PROJECT_ID` at build time as an environment fallback.

## 2. Store Assets & Verification Checks
Store branding assets live in `mobile/assets/` (`icon.png`, `adaptive-icon.png`, `splash-icon.png`, `notification-icon.png`, and `favicon.png`) and are wired into `mobile/app.json` alongside `expo-dev-client`, `expo-updates`, `expo-splash-screen`, `react-native-tcp-socket`, and `react-native-bluetooth-classic`.

```bash
npm --prefix mobile run typecheck
npm --prefix mobile run config:check
npm --prefix mobile run deps:check
```

## 3. Build Profiles (`mobile/eas.json`) & OTA Updates
- **Development (`development`)**: Expo dev client APK/simulator build with full native hardware access (camera barcode scanner, ESC/POS LAN/Bluetooth sockets, haptics, local + remote notifications).
  ```bash
  npm --prefix mobile run eas:build:dev
  ```
- **Internal Preview (`preview`)**: Installable Android APK & internal iOS build for QA testing on POS tablets and phones.
  ```bash
  npm --prefix mobile run eas:build:preview
  ```
- **Production (`production`)**: Play Store AAB & App Store IPA with `autoIncrement: true`.
  ```bash
  npm --prefix mobile run eas:build:prod
  ```
- **Over-The-Air JS Updates (`eas update`)**:
  ```bash
  npm --prefix mobile run eas:update:preview -- --message "Hotfix"
  npm --prefix mobile run eas:update:prod -- --message "Release update"
  ```

## 4. Push Notifications Credentials (Expo Push API)
1. Android uses Firebase Cloud Messaging (FCM v1). Upload your Firebase service account key with `eas credentials`.
2. iOS uses APNs (`UIBackgroundModes: ["remote-notification"]`). Let EAS generate/manage the Apple Push Key during `eas build`.
3. Optionally configure `EXPO_ACCESS_TOKEN` in the Next.js backend environment if Enhanced Push Security is enabled in your Expo dashboard.
4. Device push token sync runs automatically for Synced Cloud sessions (`POST /api/mobile/v1/notifications/push-token`), unregisters on logout (`POST /api/mobile/v1/auth/logout`), configures Android notification channels (`default`, `alerts`), and supports deep-linking when tapping low-stock, security, or message alerts.

## 5. ESC/POS Thermal Receipt Printing & Cash Drawer
- Configure **Thermal Printer Hardware (ESC/POS)** under **Settings -> Business & Receipt Setup**:
  - **System Print / AirPrint**: Renders formatted HTML (`58mm`, `80mm`, or `A4`) via OS print dialog (always available, including web/Expo Go).
  - **LAN / Wi-Fi TCP (Port 9100)**: Streams raw ESC/POS byte commands (`58mm` 32-col or `80mm` 48-col) directly to network thermal printers over TCP socket (`react-native-tcp-socket` in EAS Dev Client / Production builds).
  - **Bluetooth Thermal**: Scans paired Bluetooth printers and streams raw ESC/POS bytes via Bluetooth serial (`react-native-bluetooth-classic` in EAS builds).
  - Supports **Auto-Cut Paper** (`GS V 66 0`) and **Open Cash Drawer Pulse** (`ESC p 0 25 250`), plus **Send Test Print** calibration and one-tap **Fallback to OS Print / AirPrint** on `/sales/[id]`.

## 6. Bluetooth / USB HID Barcode Scanner Mode
- Available on **New Sale (`/sales/new`)** and **Inventory (`/(tabs)/inventory`)** via the **HID** toggle button next to the barcode camera icon.
- Keeps a hidden keyboard-wedge capture input active (`showSoftInputOnFocus={false}` so the on-screen keyboard does not pop up), parses high-speed scanner bursts with or without CR/LF suffixes, commits barcodes into the POS cart or opens matching SKU details, and triggers tactile haptics.

## 7. GitHub Actions CI/CD Workflows
- `.github/workflows/ci.yml`: Runs web/backend TypeScript check, ESLint, Vitest test suite (`tests/*.test.ts`), Production Ops preflight check (`npm run ops:check`), and mobile TypeScript + Expo config validation on every push and pull request to `main`.
- `.github/workflows/mobile-release.yml`: Validates mobile configuration on push/PR/tags (`mobile-v*`) and supports manual `workflow_dispatch` triggers for cloud **EAS Build** (`development` / `preview` / `production`) and **EAS Update** OTA publishing using the repository `EXPO_TOKEN` secret.

## 8. Production Ops & Cloud Account Binding
- **Preflight Gate**: Run `npm run ops:check` locally (advisory) or `npm run ops:check -- --strict` in deployment pipelines to verify secrets (`JWT_SECRET`, `CRON_SECRET`, `SUPER_ADMIN_PASSWORD`, `ENCRYPTION_KEY`), Turso/libSQL auth tokens, writable media storage (`public/images`), store PNG assets, and EAS project binding (`mobile/app.config.ts`).
- **Super Admin Ops Console (`/super-admin/ops`)**: Inspect live database latency, read-only environment/secret guardrails, Expo EAS project & bundle binding (`EXPO_PUBLIC_EAS_PROJECT_ID`, `EXPO_OWNER`, `EXPO_ACCESS_TOKEN`), cloud endpoint health probing, bound mobile push devices (with immediate revoke controls), and scheduled `/api/cron/eod-report` execution locks.
- **Health Endpoints**: `GET /api/health` and `GET /api/mobile/v1/health` execute live database pings (`200 healthy` / `503 degraded`) for load balancers and Cloud Run readiness checks.
