# Monitor for Pulse: macOS widget

A native desktop and Notification Center widget for [Pulse](https://github.com/rcourtman/Pulse). Read-only.

| Size | Shows |
| --- | --- |
| Small | Overall status, guests running, node CPU / memory / disk bars, temperature |
| Medium | Overall status, guests running, node gauges including temperature |
| Large | The same, up to two nodes, plus the list of what needs attention |

It uses the same rules as the phone app for what counts as an issue, including guests with no backup.
If Pulse can't be reached, the widget keeps the last reading and says "Offline".

Requires macOS 14 or later and Xcode 15 or later.

## Install

1. Open `PulseWidget.xcodeproj` in Xcode.
2. In Xcode → Settings → Accounts, sign in with your Apple ID.
3. Select the **Pulse** scheme, target **My Mac**, and press **Run** (⌘R).
4. In the window that opens, enter your Pulse address (it must be `https://` with a valid certificate) and a token with only the **Monitoring & alerts (read)** scope, then press **Connect**. Or choose **Try with Demo Data**.
5. Right-click the desktop → **Edit Widgets…** → search for **Monitor for Pulse** → drag it onto the desktop.

The app lives in the menu bar (the pulse-line icon) and must keep running: it fetches from Pulse for the widget, because macOS can block a widget from the local network. Stopping it in Xcode stops the updates, so install a copy: Product → Archive → Distribute App → Custom → Copy App, then move `Pulse.app` to Applications and open it from there. To start it at login, turn on **Open at login** in its settings; it's off by default.

To use your own Apple team, change Team under Signing & Capabilities on both targets, and change the bundle identifiers if needed.

## Refresh

The app fetches once a minute, and right away when the Mac wakes or is unlocked, and asks the widget to redraw each time. macOS decides when that actually happens and may delay it, and it doesn't tell apps when a widget becomes visible. The widget's refresh button updates it immediately. Pressing **Connect** also asks for a redraw.

## Temperature

Temperature is the node's hottest CPU sensor, from Pulse's `temperature` field. It turns orange at 70 °C and red at 85 °C.
It shows "–" (or nothing in the small size) if Pulse has no reading. Pulse gets readings from the Pulse agent on the Proxmox host; see Pulse's `docs/TEMPERATURE_MONITORING.md`.

## Troubleshooting

- **Signing errors:** check that Team is set on both the Pulse and PulseWidgetExtension targets.
- **"Connected, but the Keychain refused the token":** the same signing problem. The app and widget share the token through Keychain Sharing, which needs a team.
- **The widget says "Offline" or that it can't reach Pulse:** check that the app is running in the menu bar and shows data there. If it's quit, the widget has to connect itself, and macOS can block that.
- **The app can't reach Pulse:** check System Settings → Privacy & Security → Local Network, and allow Pulse.
- **The widget stays stuck on "not connected" after an update:** check that App Groups is listed under Signing & Capabilities on both targets, with the same group.
- **The widget doesn't appear in the gallery:** run the app once, or restart the widget service with `killall chronod`.

## Development

```bash
swift test   # logic in Shared/; runs on macOS or Linux
```

`Shared/` is compiled into both the app and the widget. The views can be previewed in Xcode from `Widget/PulseWidgetView.swift`.
