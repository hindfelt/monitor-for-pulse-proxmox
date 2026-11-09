import AppIntents
import SwiftUI
import WidgetKit

/// The widget's refresh button. WidgetKit redraws the widget after this finishes.
struct RefreshPulseIntent: AppIntent {
    static var title: LocalizedStringResource = "Refresh Pulse"

    func perform() async throws -> some IntentResult {
        if let connection = ConnectionStore.load(), let summary = try? await PulseClient(connection: connection).summary() {
            SummaryCache.save(summary)
        }
        return .result()
    }
}

struct PulseEntry: TimelineEntry {
    enum State {
        case live
        /// Showing the last good reading because this refresh failed.
        case stale(String)
        case notSetUp
        case failed(String)
    }

    let date: Date
    let summary: PulseSummary?
    let state: State

    static let preview = PulseEntry(date: Date(), summary: .sample, state: .live)
}

struct PulseProvider: TimelineProvider {
    func placeholder(in context: Context) -> PulseEntry { .preview }

    func getSnapshot(in context: Context, completion: @escaping (PulseEntry) -> Void) {
        // The widget gallery should look populated before anything is set up.
        if context.isPreview {
            completion(SummaryCache.load().map { PulseEntry(date: Date(), summary: $0, state: .live) } ?? .preview)
            return
        }
        Task { completion(await Self.currentEntry()) }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<PulseEntry>) -> Void) {
        Task {
            let entry = await Self.currentEntry()
            // A request, not a promise: macOS decides the real schedule.
            let next = Date().addingTimeInterval(15 * 60)
            completion(Timeline(entries: [entry], policy: .after(next)))
        }
    }

    private static let freshFor: TimeInterval = 5 * 60

    static func currentEntry() async -> PulseEntry {
        guard let connection = ConnectionStore.load() else {
            return PulseEntry(date: Date(), summary: nil, state: .notSetUp)
        }
        // The app fetches once a minute. Use its reading while it's recent.
        if let shared = SummaryCache.load(), Date().timeIntervalSince(shared.date) < freshFor {
            return PulseEntry(date: Date(), summary: shared, state: .live)
        }
        // Otherwise the app may not be running, so try directly. macOS can block this on a local network.
        do {
            let summary = try await PulseClient(connection: connection).summary()
            SummaryCache.save(summary)
            return PulseEntry(date: Date(), summary: summary, state: .live)
        } catch {
            let message = error.localizedDescription
            if let cached = SummaryCache.load() {
                return PulseEntry(date: Date(), summary: cached, state: .stale(message))
            }
            return PulseEntry(date: Date(), summary: nil, state: .failed(message))
        }
    }
}

struct PulseStatusWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "PulseStatusWidget", provider: PulseProvider()) { entry in
            PulseWidgetView(entry: entry)
                .containerBackground(.background, for: .widget)
        }
        .configurationDisplayName("Monitor for Pulse")
        .description("Guests, issues and your Proxmox node's CPU, memory, disk and temperature.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

@main
struct PulseWidgetBundle: WidgetBundle {
    var body: some Widget {
        PulseStatusWidget()
    }
}
