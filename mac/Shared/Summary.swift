import Foundation

public enum Tone: String, Codable, Hashable, Sendable {
    case ok, warn, bad

    /// Usage thresholds, same as the phone app.
    public static func usage(_ pct: Double) -> Tone {
        pct >= 90 ? .bad : pct >= 80 ? .warn : .ok
    }

    /// CPU temperature in °C.
    public static func temperature(_ c: Double) -> Tone {
        c >= 85 ? .bad : c >= 70 ? .warn : .ok
    }
}

public struct NodeSummary: Codable, Hashable, Sendable {
    public var name: String
    public var online: Bool
    public var cpu: Double
    public var memory: Double
    public var disk: Double
    public var temperatureC: Double?

    public init(name: String, online: Bool, cpu: Double, memory: Double, disk: Double, temperatureC: Double?) {
        self.name = name
        self.online = online
        self.cpu = cpu
        self.memory = memory
        self.disk = disk
        self.temperatureC = temperatureC
    }
}

public struct IssueRow: Codable, Hashable, Sendable {
    public var name: String
    public var text: String
    public var tone: Tone

    public init(name: String, text: String, tone: Tone) {
        self.name = name
        self.text = text
        self.tone = tone
    }
}

/// Everything a widget needs. Holds no secrets, so it is safe to cache on disk.
public struct PulseSummary: Codable, Hashable, Sendable {
    public var date: Date
    public var nodes: [NodeSummary]
    public var guestsRunning: Int
    public var guestsTotal: Int
    /// Guests and nodes with at least one issue, plus unacknowledged alerts on anything else.
    public var issueCount: Int
    public var alertCount: Int
    public var overall: Tone
    /// Worst first.
    public var rows: [IssueRow]

    public init(date: Date, nodes: [NodeSummary], guestsRunning: Int, guestsTotal: Int, issueCount: Int, alertCount: Int, overall: Tone, rows: [IssueRow]) {
        self.date = date
        self.nodes = nodes
        self.guestsRunning = guestsRunning
        self.guestsTotal = guestsTotal
        self.issueCount = issueCount
        self.alertCount = alertCount
        self.overall = overall
        self.rows = rows
    }

    public var headline: String {
        if issueCount == 0 { return "All good" }
        return issueCount == 1 ? "1 needs attention" : "\(issueCount) need attention"
    }

    public static let sample = PulseSummary(
        date: Date(timeIntervalSince1970: 1_800_000_000),
        nodes: [NodeSummary(name: "node-1", online: true, cpu: 3, memory: 63, disk: 17, temperatureC: 48)],
        guestsRunning: 7,
        guestsTotal: 7,
        issueCount: 3,
        alertCount: 0,
        overall: .bad,
        rows: [
            IssueRow(name: "dev-server", text: "No completed backup reported", tone: .bad),
            IssueRow(name: "nas", text: "Disk 88% full", tone: .warn),
            IssueRow(name: "web-proxy", text: "Last backup 7 days ago", tone: .warn),
        ]
    )
}

// MARK: - Same rules as the phone app (mobile/src/lib/attention.ts)

private let diskWarn = 85.0
private let diskBad = 95.0

/// Go serialises an unset time as "0001-01-01T00:00:00Z", which is before 1970.
func hasNoBackup(_ r: Resource) -> Bool {
    guard r.isGuest, let proxmox = r.proxmox else { return false }
    guard let last = proxmox.lastBackup, !last.isEmpty else { return true }
    return last.hasPrefix("0001-")
}

/// "7d" → "7 days", "1h" → "1 hour"; anything else stays nil.
func humanDuration(_ raw: String) -> String? {
    let s = raw.trimmingCharacters(in: .whitespaces).lowercased()
    guard let unit = s.last, let n = Int(s.dropLast().trimmingCharacters(in: .whitespaces)), n >= 0 else { return nil }
    let names: [Character: String] = ["s": "second", "m": "minute", "h": "hour", "d": "day", "w": "week"]
    guard let name = names[unit] else { return nil }
    return "\(n) \(name)\(n == 1 ? "" : "s")"
}

private let reasonLabels = [
    "backup_stale": "Backup overdue",
    "resource_risk": "Running low on resources",
    "critical_alert": "Critical alert",
    "warning_alert": "Warning alert",
    "critical_incident": "Critical incident",
    "telemetry_stale": "Readings are stale",
    "telemetry_missing": "No readings",
    "status_unknown": "Status unknown",
    "powered_off": "Powered off",
    "availability_failed": "Availability check failing",
    "offline": "Offline",
]

func reasonText(_ reason: Resource.Health.Reason) -> String {
    let readable = reason.code.replacingOccurrences(of: "_", with: " ")
    let label = reasonLabels[reason.code] ?? readable.prefix(1).uppercased() + readable.dropFirst()
    guard let detail = reason.detail?.trimmingCharacters(in: .whitespaces), !detail.isEmpty else { return label }
    if let d = humanDuration(detail) {
        return reason.code == "backup_stale" ? "Last backup \(d) ago" : "\(label) (\(d))"
    }
    return detail.count <= 12 ? "\(label) (\(detail))" : detail
}

func issues(for r: Resource) -> [IssueRow] {
    var out: [IssueRow] = []
    let noBackup = hasNoBackup(r) && r.proxmox?.backupInProgress != true
    if noBackup {
        out.append(IssueRow(name: r.name, text: "No completed backup reported", tone: .bad))
    }
    let verdict = r.health?.verdict
    if verdict == "attention" || verdict == "critical" || verdict == "stale" {
        let tone: Tone = verdict == "critical" ? .bad : .warn
        let reasons = r.health?.reasons ?? []
        if reasons.isEmpty {
            out.append(IssueRow(name: r.name, text: "Needs attention", tone: tone))
        }
        for reason in reasons where !(reason.code == "backup_stale" && noBackup) {
            out.append(IssueRow(name: r.name, text: reasonText(reason), tone: tone))
        }
    }
    if let disk = r.metrics?.disk?.pct, disk >= diskWarn {
        out.append(IssueRow(name: r.name, text: "Disk \(Int(disk.rounded()))% full", tone: disk >= diskBad ? .bad : .warn))
    }
    return out
}

public func summarize(resources: [Resource], alerts: [Alert], now: Date = Date()) -> PulseSummary {
    let nodes = resources.filter { $0.type == "agent" }.sorted { $0.name < $1.name }
    let guests = resources.filter(\.isGuest)
    let openAlerts = alerts.filter { $0.acknowledged != true }

    var affected = Set<String>()
    var rows: [IssueRow] = []
    for r in nodes + guests + resources.filter({ $0.type == "storage" }) {
        let found = issues(for: r)
        if !found.isEmpty { affected.insert(r.name) }
        rows += found
    }
    for alert in openAlerts {
        let name = alert.resourceName ?? "Alert"
        affected.insert(name)
        rows.append(IssueRow(name: name, text: alert.summary ?? alert.message ?? "Active alert", tone: alert.level == "critical" ? .bad : .warn))
    }

    let hot = nodes.compactMap(\.temperatureC).contains { Tone.temperature($0) != .ok }
    let offline = nodes.contains { !$0.isRunning }
    let hasBad = rows.contains { $0.tone == .bad } || offline
    let overall: Tone = hasBad ? .bad : (!rows.isEmpty || hot) ? .warn : .ok

    // Stable sort: critical first, otherwise keep nodes before guests.
    let sorted = rows.enumerated().sorted { a, b in
        let (x, y) = (a.element.tone == .bad, b.element.tone == .bad)
        return x != y ? x : a.offset < b.offset
    }.map(\.element)

    return PulseSummary(
        date: now,
        nodes: nodes.map {
            NodeSummary(
                name: $0.name,
                online: $0.isRunning,
                cpu: $0.metrics?.cpu?.pct ?? 0,
                memory: $0.metrics?.memory?.pct ?? 0,
                disk: $0.metrics?.disk?.pct ?? 0,
                temperatureC: $0.temperatureC
            )
        },
        guestsRunning: guests.filter(\.isRunning).count,
        guestsTotal: guests.count,
        issueCount: affected.count,
        alertCount: openAlerts.count,
        overall: overall,
        rows: sorted
    )
}
