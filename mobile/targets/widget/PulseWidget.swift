import SwiftUI
import WidgetKit

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
            // A request, not a promise: iOS decides the real schedule.
            let next = Date().addingTimeInterval(15 * 60)
            completion(Timeline(entries: [entry], policy: .after(next)))
        }
    }

    static func currentEntry() async -> PulseEntry {
        guard let connection = ConnectionStore.load() else {
            return PulseEntry(date: Date(), summary: nil, state: .notSetUp)
        }
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
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

@main
struct PulseWidgetBundle: WidgetBundle {
    var body: some Widget {
        PulseStatusWidget()
    }
}
