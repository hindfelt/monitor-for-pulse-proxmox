import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public struct PulseConnection: Codable, Hashable, Sendable {
    public var url: String
    public var token: String

    public init(url: String, token: String) {
        self.url = PulseConnection.normalize(url)
        self.token = token.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Built-in sample data, for trying the app and for App Review. No network involved.
    public static let demo = PulseConnection(url: "demo://sample", token: "demo")

    public var isDemo: Bool { url == "demo://sample" }

    /// The token travels in a header, so it is only ever sent over HTTPS.
    public var isHTTPS: Bool {
        guard url.lowercased().hasPrefix("https://") else { return false }
        return url.count > "https://".count
    }

    /// Trims, adds https:// when no scheme was typed, drops trailing slashes.
    public static func normalize(_ raw: String) -> String {
        var s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !s.isEmpty else { return s }
        if !s.contains("://") { s = "https://" + s }
        while s.hasSuffix("/") { s.removeLast() }
        return s
    }
}

public enum PulseError: LocalizedError, Equatable {
    case badAddress
    case httpsRequired
    case unauthorized
    case http(Int)
    case unreachable(String)
    case badResponse

    public var errorDescription: String? {
        switch self {
        case .badAddress: return "That address doesn't look right."
        case .httpsRequired: return "Pulse has to be reached over HTTPS, so your token stays encrypted. Enter an https:// address."
        case .unauthorized: return "Pulse rejected the token. It needs the “Monitoring & alerts (read)” scope."
        case .http(let code): return "Pulse answered with error \(code)."
        case .unreachable(let why): return "Can't reach Pulse: \(why) Check the address and that its HTTPS certificate is valid."
        case .badResponse: return "Pulse sent a response this version can't read."
        }
    }
}

public struct PulseClient: Sendable {
    public var connection: PulseConnection

    public init(connection: PulseConnection) {
        self.connection = connection
    }

    public func summary() async throws -> PulseSummary {
        if connection.isDemo {
            var sample = PulseSummary.sample
            sample.date = Date()
            return sample
        }
        async let resources = allResources()
        // Alerts are a bonus: a failure here shouldn't blank the widget.
        async let alerts = activeAlerts()
        let all = try await resources
        return summarize(resources: all, alerts: (try? await alerts) ?? [])
    }

    func allResources() async throws -> [Resource] {
        var out: [Resource] = []
        for page in 1...50 {
            let res: ResourcesResponse = try await get("/api/resources?type=agent,vm,system-container,oci-container,storage&limit=100&page=\(page)")
            out += res.data ?? []
            if page >= (res.meta?.totalPages ?? 1) { break }
        }
        return out
    }

    func activeAlerts() async throws -> [Alert] {
        let res: AlertsResponse = try await get("/api/alerts/active")
        return res.alerts
    }

    private func get<T: Decodable>(_ path: String) async throws -> T {
        guard connection.isHTTPS else { throw PulseError.httpsRequired }
        guard let url = URL(string: connection.url + path), url.host != nil else { throw PulseError.badAddress }
        var request = URLRequest(url: url, timeoutInterval: 10)
        request.setValue(connection.token, forHTTPHeaderField: "X-API-Token")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw PulseError.unreachable(error.localizedDescription)
        }
        if let http = response as? HTTPURLResponse {
            if http.statusCode == 401 || http.statusCode == 403 { throw PulseError.unauthorized }
            if !(200..<300).contains(http.statusCode) { throw PulseError.http(http.statusCode) }
        }
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw PulseError.badResponse
        }
    }
}
