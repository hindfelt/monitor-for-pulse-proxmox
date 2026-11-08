import SwiftUI
import WidgetKit

private extension Tone {
    var color: Color {
        switch self {
        case .ok: return .green
        case .warn: return .orange
        case .bad: return .red
        }
    }
}

struct PulseWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: PulseEntry

    var body: some View {
        if let summary = entry.summary {
            switch family {
            case .systemSmall: SmallView(summary: summary, state: entry.state)
            case .systemMedium: MediumView(summary: summary, state: entry.state)
            case .accessoryCircular: LockCircularView(summary: summary)
            case .accessoryRectangular: LockRectangularView(summary: summary)
            case .accessoryInline: LockInlineView(summary: summary)
            default: LargeView(summary: summary, state: entry.state)
            }
        } else if family == .accessoryCircular || family == .accessoryRectangular || family == .accessoryInline {
            Label("Open app", systemImage: "waveform.path.ecg")
        } else {
            MessageView(state: entry.state)
        }
    }
}

// MARK: - Sizes

private struct SmallView: View {
    let summary: PulseSummary
    let state: PulseEntry.State

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Headline(summary: summary, state: state, compact: true)
            Spacer(minLength: 0)
            if let node = summary.nodes.first {
                VStack(spacing: 5) {
                    MetricBar(label: "CPU", value: node.cpu)
                    MetricBar(label: "Mem", value: node.memory)
                    MetricBar(label: "Disk", value: node.disk)
                }
                TemperatureLine(celsius: node.temperatureC)
            }
            Footer(summary: summary, state: state)
        }
    }
}

private struct MediumView: View {
    let summary: PulseSummary
    let state: PulseEntry.State

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Headline(summary: summary, state: state, compact: false)
            if let node = summary.nodes.first {
                NodeGauges(node: node, extraNodes: summary.nodes.count - 1)
            }
            Spacer(minLength: 0)
            Footer(summary: summary, state: state)
        }
    }
}

private struct LargeView: View {
    let summary: PulseSummary
    let state: PulseEntry.State
    private let maxRows = 6

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Headline(summary: summary, state: state, compact: false)
            ForEach(summary.nodes.prefix(2), id: \.name) { node in
                NodeGauges(node: node, extraNodes: 0)
            }
            Divider()
            if summary.rows.isEmpty {
                Label("Nothing needs attention", systemImage: "checkmark.circle.fill")
                    .font(.callout)
                    .foregroundStyle(.green)
            } else {
                VStack(alignment: .leading, spacing: 7) {
                    ForEach(Array(summary.rows.prefix(maxRows).enumerated()), id: \.offset) { _, row in
                        IssueLine(row: row)
                    }
                    if summary.rows.count > maxRows {
                        Text("and \(summary.rows.count - maxRows) more")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            Spacer(minLength: 0)
            Footer(summary: summary, state: state)
        }
    }
}

private struct MessageView: View {
    let state: PulseEntry.State

    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: "waveform.path.ecg")
                .font(.title2)
                .foregroundStyle(.secondary)
            switch state {
            case .failed(let message), .stale(let message):
                Text(message).font(.caption).multilineTextAlignment(.center).foregroundStyle(.secondary)
            default:
                Text("Open Monitor for Pulse to connect to your server").font(.caption).multilineTextAlignment(.center).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Lock Screen

private struct LockCircularView: View {
    let summary: PulseSummary

    var body: some View {
        ZStack {
            AccessoryWidgetBackground()
            if summary.issueCount == 0 {
                Image(systemName: "checkmark")
                    .font(.title3.weight(.bold))
            } else {
                VStack(spacing: 0) {
                    Text("\(summary.issueCount)")
                        .font(.title3.weight(.bold).monospacedDigit())
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.caption2)
                }
            }
        }
        .accessibilityLabel(summary.headline)
    }
}

private struct LockRectangularView: View {
    let summary: PulseSummary

    private var metrics: String {
        guard let node = summary.nodes.first else { return "No node data" }
        var parts = ["CPU \(Int(node.cpu.rounded()))%", "Mem \(Int(node.memory.rounded()))%"]
        if let celsius = node.temperatureC { parts.append("\(Int(celsius.rounded()))°C") }
        return parts.joined(separator: " · ")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(summary.headline)
                .font(.headline)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Text("\(summary.guestsRunning) of \(summary.guestsTotal) guests running")
                .lineLimit(1)
            Text(metrics)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .font(.caption)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct LockInlineView: View {
    let summary: PulseSummary

    var body: some View {
        if let celsius = summary.nodes.first?.temperatureC {
            Text("\(summary.headline) · \(Int(celsius.rounded()))°C")
        } else {
            Text(summary.headline)
        }
    }
}

// MARK: - Parts

private struct Headline: View {
    let summary: PulseSummary
    let state: PulseEntry.State
    let compact: Bool

    private var isStale: Bool {
        if case .stale = state { return true }
        return false
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            HStack(spacing: 6) {
                Circle()
                    .fill(isStale ? Color.secondary : summary.overall.color)
                    .frame(width: 9, height: 9)
                Text(summary.headline)
                    .font(.headline)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }
            Text("\(summary.guestsRunning) of \(summary.guestsTotal) guests running")
                .font(compact ? .caption2 : .caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
    }
}

private struct Footer: View {
    let summary: PulseSummary
    let state: PulseEntry.State

    private var isStale: Bool {
        if case .stale = state { return true }
        return false
    }

    var body: some View {
        // Says how old the numbers are, so an out-of-date widget can't pass for a live one.
        Group {
            if isStale {
                Text("Offline · last update \(summary.date, style: .time)")
            } else {
                Text("Updated \(summary.date, style: .time)")
            }
        }
        .font(.caption2)
        .foregroundStyle(.secondary)
        .lineLimit(1)
    }
}

private struct MetricBar: View {
    let label: String
    let value: Double

    var body: some View {
        HStack(spacing: 5) {
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .frame(width: 26, alignment: .leading)
            ProgressView(value: min(max(value, 0), 100), total: 100)
                .tint(Tone.usage(value).color)
            Text("\(Int(value.rounded()))%")
                .font(.caption2.monospacedDigit())
                .frame(width: 30, alignment: .trailing)
        }
    }
}

private struct TemperatureLine: View {
    let celsius: Double?

    var body: some View {
        if let celsius {
            Label("\(Int(celsius.rounded()))°C", systemImage: "thermometer.medium")
                .font(.caption2.monospacedDigit())
                .foregroundStyle(Tone.temperature(celsius).color)
        }
    }
}

private struct NodeGauges: View {
    let node: NodeSummary
    let extraNodes: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(extraNodes > 0 ? "\(node.name) +\(extraNodes)" : node.name)
                .font(.caption.weight(.semibold))
                .foregroundStyle(node.online ? Color.primary : Color.red)
                .lineLimit(1)
            HStack(spacing: 0) {
                RingGauge(label: "CPU", text: "\(Int(node.cpu.rounded()))%", fraction: node.cpu / 100, tone: .usage(node.cpu))
                RingGauge(label: "Memory", text: "\(Int(node.memory.rounded()))%", fraction: node.memory / 100, tone: .usage(node.memory))
                RingGauge(label: "Disk", text: "\(Int(node.disk.rounded()))%", fraction: node.disk / 100, tone: .usage(node.disk))
                if let celsius = node.temperatureC {
                    // Rings fill over 0-100 °C so the scale matches the percentages beside them.
                    RingGauge(label: "Temp", text: "\(Int(celsius.rounded()))°", fraction: celsius / 100, tone: .temperature(celsius))
                } else {
                    RingGauge(label: "Temp", text: "–", fraction: 0, tone: .ok)
                }
            }
        }
    }
}

private struct RingGauge: View {
    let label: String
    let text: String
    let fraction: Double
    let tone: Tone

    var body: some View {
        VStack(spacing: 3) {
            ZStack {
                Circle().stroke(.quaternary, lineWidth: 4)
                Circle()
                    .trim(from: 0, to: min(max(fraction, 0), 1))
                    .stroke(tone.color, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                Text(text)
                    .font(.system(size: 11, weight: .semibold).monospacedDigit())
                    .minimumScaleFactor(0.7)
                    .lineLimit(1)
                    .padding(.horizontal, 4)
            }
            .frame(width: 42, height: 42)
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}

private struct IssueLine: View {
    let row: IssueRow

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Circle()
                .fill(row.tone.color)
                .frame(width: 7, height: 7)
            Text(row.name)
                .font(.caption.weight(.semibold))
                .lineLimit(1)
            Text(row.text)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
    }
}

#Preview("Small", as: .systemSmall) {
    PulseStatusWidget()
} timeline: {
    PulseEntry.preview
}

#Preview("Medium", as: .systemMedium) {
    PulseStatusWidget()
} timeline: {
    PulseEntry.preview
}

#Preview("Large", as: .systemLarge) {
    PulseStatusWidget()
} timeline: {
    PulseEntry.preview
}
