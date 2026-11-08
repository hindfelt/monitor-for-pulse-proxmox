import Foundation

// Subset of the Pulse 6.x unified resource API that the widget reads.
// Source of truth: rcourtman/Pulse internal/unifiedresources/types.go

public struct MetricValue: Codable, Hashable, Sendable {
    public var value: Double?
    public var percent: Double?
    public var used: Double?
    public var total: Double?

    public init(value: Double? = nil, percent: Double? = nil, used: Double? = nil, total: Double? = nil) {
        self.value = value
        self.percent = percent
        self.used = used
        self.total = total
    }

    /// Same rule as Pulse: percent if set, else value, else used/total.
    public var pct: Double {
        if let percent, percent > 0 { return percent }
        if let value, value > 0 { return value }
        if let used, let total, total > 0 { return used / total * 100 }
        return 0
    }
}

public struct Resource: Codable, Hashable, Sendable {
    public struct Health: Codable, Hashable, Sendable {
        public struct Reason: Codable, Hashable, Sendable {
            public var code: String
            public var detail: String?
        }
        public var verdict: String?
        public var reasons: [Reason]?
    }
    public struct Metrics: Codable, Hashable, Sendable {
        public var cpu: MetricValue?
        public var memory: MetricValue?
        public var disk: MetricValue?
    }
    public struct Proxmox: Codable, Hashable, Sendable {
        public var lastBackup: String?
        public var backupInProgress: Bool?
        public var temperature: Double?
    }
    public struct Agent: Codable, Hashable, Sendable {
        public var temperature: Double?
    }

    public var id: String
    public var type: String
    public var name: String
    public var status: String?
    public var temperature: Double?
    public var health: Health?
    public var metrics: Metrics?
    public var proxmox: Proxmox?
    public var agent: Agent?

    /// Hottest CPU sensor in °C. Pulse omits it when the host reports no sensors.
    public var temperatureC: Double? {
        let t = temperature ?? proxmox?.temperature ?? agent?.temperature
        guard let t, t > 0 else { return nil }
        return t
    }

    public var isRunning: Bool { status == "running" || status == "online" }
    public var isGuest: Bool { ["vm", "system-container", "oci-container"].contains(type) }
}

public struct ResourcesResponse: Codable, Sendable {
    public struct Meta: Codable, Sendable {
        public var totalPages: Int?
    }
    public var data: [Resource]?
    public var meta: Meta?
}

public struct Alert: Codable, Hashable, Sendable {
    public var id: String
    public var level: String?
    public var resourceName: String?
    public var message: String?
    public var summary: String?
    public var acknowledged: Bool?
}

/// /api/alerts/active returns either a bare array or `{ "alerts": [...] }`.
public struct AlertsResponse: Decodable, Sendable {
    public var alerts: [Alert]

    private enum CodingKeys: String, CodingKey { case alerts }

    public init(from decoder: Decoder) throws {
        if let list = try? decoder.singleValueContainer().decode([Alert].self) {
            alerts = list
        } else {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            alerts = try c.decodeIfPresent([Alert].self, forKey: .alerts) ?? []
        }
    }
}
