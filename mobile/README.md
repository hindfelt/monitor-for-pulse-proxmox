# Pulse mobile

Native iPhone and Android app for [Pulse](https://github.com/rcourtman/Pulse) (Proxmox monitoring), built with Expo.
It talks to your Pulse server directly. There is no extra server to run.

- **Home**: node gauges, guests running, and only the things that need attention.
- **Guests**: cards with CPU/memory/disk, search (name, VMID, tag), filters, sorting.
- **Guest detail**: 1h/24h/7d history, "disk full in about N days" forecast, last backup, web UI link.
- **Storage** and **Alerts** tabs, with an alert badge on the tab bar.
- Read-only. Shows the last known data instantly on launch, refreshes every 5 s while open, and stops polling in the background.

## Connecting

1. In Pulse: Settings → API Access → create a token with only `monitoring:read`.
2. Open the app, enter Pulse's address (e.g. `https://pulse.example.com`) and the token. The token is stored in the iOS Keychain / Android Keystore.
3. Away from home, turn on Tailscale on the phone and use Pulse's tailnet address.

Pulse must be reached over HTTPS with a certificate the phone trusts, for example through Caddy. Plain `http://` is refused, so the token is never sent unencrypted.

## Development

```bash
npm install
npx expo start        # scan the QR code with Expo Go (iOS/Android)
npm test              # logic tests
npm run typecheck && npm run lint
```

"Try it with demo data" on the connect screen shows a demo homelab without a server.

## Builds (EAS, in the cloud)

```bash
npx eas-cli@latest login
npx eas-cli@latest build -p android --profile apk          # free APK to install on Android
npx eas-cli@latest build -p ios --profile production       # iPhone build (Apple Developer Program)
npx eas-cli@latest submit -p ios                           # upload to TestFlight
```

Not affiliated with the Pulse project.
