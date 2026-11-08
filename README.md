<img src="assets/icon.svg" width="72" height="72" alt="">

# Monitor for Pulse

Your Proxmox homelab at a glance. A read-only iPhone app, iPhone widgets and a Mac widget for [Pulse](https://github.com/rcourtman/Pulse), the self-hosted monitoring tool.

Not affiliated with the Pulse project.

- **Home:** node CPU, memory, disk and temperature gauges, plus a short list of what needs attention, including guests with no backup, overdue backups and filling disks.
- **Guests:** search, filter and sort by issues, CPU, memory, disk or name.
- **Guest details:** 1h, 24h and 7d history, a disk-full forecast and plain-language steps for fixing each issue.
- **Storage and Alerts** tabs.
- **Widgets:** Home Screen and Lock Screen on iPhone, and desktop on Mac.

It only reads data. It has no account, analytics or tracking, and connects only to your own Pulse server over HTTPS. See the [privacy policy](https://0x4d.in/monitor-for-pulse/privacy/).

## What you need

- A running Pulse server, reachable over HTTPS with a valid certificate.
- A Pulse API token with only the **Monitoring & alerts (read)** scope.

The [setup guide](https://0x4d.in/monitor-for-pulse/guide/) walks through this step by step, including a way to expose only the read-only API. To look around first, choose **Try it with demo data**, which needs no server.

## Repository

| Folder | Contents |
| --- | --- |
| [`mobile/`](mobile) | iPhone and Android app with iOS widgets (Expo, React Native) |
| [`mac/`](mac) | macOS menu bar app and widget (SwiftUI, WidgetKit) |
| [`site/`](site) | Setup guide, support and privacy pages |
| [`store/`](store) | App Store listing text |

## Development

```bash
cd mobile
npm install
npx expo start      # run with a development client or Expo Go; widgets need a full build
npm test            # logic tests
npm run typecheck
npm run lint
```

```bash
cd mac
swift test          # logic tests; open PulseWidget.xcodeproj to build the app
```

The Swift files in `mobile/targets/widget` other than `Store.swift`, `PulseWidget.swift` and `PulseWidgetView.swift` are copies of `mac/Shared`. Keep them in sync.

### Building your own copy

The project's identifiers belong to the original publisher. To build under your own Apple account, change them in these places:

- `mobile/app.json`: `owner`, `extra.eas.projectId`, `ios.appleTeamId`, and the bundle identifiers
- `mobile/eas.json`: `ascAppId` and `appleTeamId`
- `mobile/src/lib/store.ts`: `accessGroup`
- `mobile/targets/widget/expo-target.config.js`: the keychain group
- `mac/PulseWidget.xcodeproj`: team and bundle identifiers
- `mac/App/App.entitlements`, `mac/Widget/Widget.entitlements` and `mac/Shared/Storage.swift`: the keychain and App Group identifiers

Signing keys and API tokens are not in this repository, and must never be added.

## License

[MIT](LICENSE)
