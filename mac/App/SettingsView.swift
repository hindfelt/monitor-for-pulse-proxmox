import ServiceManagement
import SwiftUI
import WidgetKit

/// First-run setup and, later, settings: connect, choose whether to open at login, add the widget.
struct SettingsView: View {
    /// Called after the connection is saved or removed.
    let onChange: () -> Void

    private enum Status: Equatable {
        case idle
        case testing
        case saved(String)
        case failed(String)
    }

    @State private var address = ""
    @State private var token = ""
    @State private var status = Status.idle
    @State private var hasSaved = false
    @State private var isDemo = false
    @State private var opensAtLogin = SMAppService.mainApp.status == .enabled

    private var canSave: Bool {
        status != .testing
            && !address.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        Form {
            Section {
                HStack(spacing: 14) {
                    Image(nsImage: NSApplication.shared.applicationIconImage)
                        .resizable()
                        .frame(width: 56, height: 56)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(verbatim: "Monitor for Pulse").font(.title2.weight(.bold))
                        Text("Your Proxmox homelab on your desktop. Read-only, and connected only to your own Pulse server.")
                            .font(.callout)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.vertical, 4)
            }

            Section {
                TextField("Address", text: $address, prompt: Text(verbatim: "https://pulse.example.com"))
                    .autocorrectionDisabled()
                SecureField("API token", text: $token)
                HStack {
                    if hasSaved {
                        Button("Disconnect", role: .destructive, action: disconnect)
                    } else {
                        Button("Try with Demo Data", action: useDemo)
                    }
                    Spacer()
                    if status == .testing {
                        ProgressView().controlSize(.small)
                    }
                    Button("Connect", action: save)
                        .keyboardShortcut(.defaultAction)
                        .disabled(!canSave)
                }
                switch status {
                case .saved(let text):
                    Label(text, systemImage: "checkmark.circle.fill").foregroundStyle(.green)
                case .failed(let text):
                    Label(text, systemImage: "exclamationmark.triangle.fill").foregroundStyle(.red)
                default:
                    if isDemo {
                        Label("Showing demo data.", systemImage: "sparkles").foregroundStyle(.secondary)
                    }
                }
            } header: {
                Text("1. Connect to Pulse")
            } footer: {
                Text("Use an https:// address with a valid certificate, and a token with only the “Monitoring & alerts (read)” scope. The token stays in this Mac's Keychain.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section {
                Toggle("Open at login", isOn: $opensAtLogin)
                    .onChange(of: opensAtLogin) { _, enabled in
                        if enabled {
                            try? SMAppService.mainApp.register()
                        } else {
                            try? SMAppService.mainApp.unregister()
                        }
                        opensAtLogin = SMAppService.mainApp.status == .enabled
                    }
            } header: {
                Text("2. Keep the widget updated")
            } footer: {
                Text("The app stays in the menu bar and fetches once a minute for the widget. If it isn't running, the widget stops updating and shows “Offline”. Without this option, you start the app yourself after each restart.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section {
                Text("Right-click the desktop, choose **Edit Widgets…**, search for **Monitor for Pulse** and drag it where you want it.")
                    .font(.callout)
            } header: {
                Text("3. Add the widget")
            } footer: {
                Text("macOS decides when the widget redraws. Not affiliated with the Pulse project.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
        .frame(width: 460)
        .fixedSize(horizontal: false, vertical: true)
        .onAppear(perform: load)
    }

    private func load() {
        guard let saved = ConnectionStore.load() else { return }
        hasSaved = true
        isDemo = saved.isDemo
        guard !saved.isDemo else { return }
        address = saved.url
        token = saved.token
    }

    @MainActor
    private func save() {
        let connection = PulseConnection(url: address, token: token)
        guard connection.isHTTPS else {
            status = .failed(PulseError.httpsRequired.localizedDescription)
            return
        }
        status = .testing
        Task {
            do {
                let summary = try await PulseClient(connection: connection).summary()
                guard ConnectionStore.save(connection) else {
                    status = .failed("Connected, but the Keychain refused the token. Check signing in Xcode.")
                    return
                }
                SummaryCache.save(summary)
                address = connection.url
                hasSaved = true
                isDemo = false
                status = .saved("Connected: \(summary.guestsTotal) guests on \(summary.nodes.count) node(s).")
                WidgetCenter.shared.reloadAllTimelines()
                onChange()
            } catch {
                status = .failed(error.localizedDescription)
            }
        }
    }

    @MainActor
    private func useDemo() {
        guard ConnectionStore.save(.demo) else {
            status = .failed("The Keychain refused to save. Check signing in Xcode.")
            return
        }
        hasSaved = true
        isDemo = true
        status = .idle
        WidgetCenter.shared.reloadAllTimelines()
        onChange()
    }

    private func disconnect() {
        ConnectionStore.clear()
        SummaryCache.clear()
        address = ""
        token = ""
        hasSaved = false
        isDemo = false
        status = .idle
        WidgetCenter.shared.reloadAllTimelines()
        onChange()
    }
}
