import AppKit
import SwiftUI
import WidgetKit

/// Runs in the menu bar and fetches for the widget, because macOS can block a widget's own
/// access to the local network. The widget reads what this app saves to the shared container.
@main
struct PulseApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate

    var body: some Scene {
        MenuBarExtra {
            MenuContent(refresher: delegate.refresher, openSettings: { delegate.showSettings() })
        } label: {
            Image(systemName: "waveform.path.ecg")
        }
    }
}

private struct MenuContent: View {
    @ObservedObject var refresher: Refresher
    let openSettings: () -> Void

    var body: some View {
        if let error = refresher.error {
            Text(error)
        } else if let summary = refresher.summary {
            Text(summary.headline)
            Text("\(summary.guestsRunning) of \(summary.guestsTotal) guests running")
        } else {
            Text("Not connected")
        }
        Divider()
        Button("Refresh Now") {
            Task { await refresher.refresh() }
        }
        Button("Settings…", action: openSettings)
        Divider()
        Button("Quit Monitor for Pulse") {
            NSApplication.shared.terminate(nil)
        }
    }
}

@MainActor
final class Refresher: ObservableObject {
    @Published private(set) var summary: PulseSummary?
    @Published private(set) var error: String?

    private var loop: Task<Void, Never>?
    private var lastReload = Date.distantPast
    private var lastReloaded: PulseSummary?
    /// macOS rations widget reloads, so routine number changes wait for this long.
    private let routineReload: TimeInterval = 5 * 60

    func start() {
        loop?.cancel()
        loop = Task { [weak self] in
            while !Task.isCancelled {
                await self?.refresh()
                try? await Task.sleep(for: .seconds(60))
            }
        }
    }

    func refresh() async {
        guard let connection = ConnectionStore.load() else {
            summary = nil
            error = nil
            return
        }
        do {
            let next = try await PulseClient(connection: connection).summary()
            SummaryCache.save(next)
            summary = next
            error = nil
            reloadWidgetIfNeeded(next)
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func reloadWidgetIfNeeded(_ next: PulseSummary) {
        let previous = lastReloaded
        let statusChanged = previous?.overall != next.overall
            || previous?.rows != next.rows
            || previous?.guestsRunning != next.guestsRunning
        guard statusChanged || Date().timeIntervalSince(lastReload) >= routineReload else { return }
        lastReload = Date()
        lastReloaded = next
        WidgetCenter.shared.reloadAllTimelines()
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    let refresher = Refresher()
    private var window: NSWindow?

    func applicationDidFinishLaunching(_ notification: Notification) {
        refresher.start()
        if ConnectionStore.load() == nil { showSettings() }
    }

    /// Opening the app again (or clicking the widget) shows the settings window.
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        showSettings()
        return false
    }

    func showSettings() {
        if window == nil {
            let view = SettingsView(onChange: { [weak self] in self?.refresher.start() })
            let created = NSWindow(contentViewController: NSHostingController(rootView: view))
            created.title = "Monitor for Pulse"
            created.styleMask = [.titled, .closable, .miniaturizable]
            created.isReleasedWhenClosed = false
            created.center()
            window = created
        }
        NSApplication.shared.activate(ignoringOtherApps: true)
        window?.makeKeyAndOrderFront(nil)
    }
}
