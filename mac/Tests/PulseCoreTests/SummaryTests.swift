import XCTest
@testable import PulseCore

final class SummaryTests: XCTestCase {
    // Shaped like a real Pulse 6.6 response, with fields the widget ignores left in.
    private let fixture = #"""
    {"data":[
     {"id":"n1","type":"agent","name":"node-1","status":"online","temperature":47.5,"uptime":100,
      "metrics":{"cpu":{"value":2.8},"memory":{"value":0,"percent":63,"used":63,"total":100},"disk":{"value":17}},
      "health":{"verdict":"ok","reasons":[]}},
     {"id":"g1","type":"system-container","name":"dev-server","status":"running",
      "proxmox":{"vmid":101,"lastBackup":"0001-01-01T00:00:00Z"},
      "metrics":{"disk":{"value":6}},"health":{"verdict":"ok"}},
     {"id":"g2","type":"vm","name":"nas","status":"running",
      "proxmox":{"vmid":102,"lastBackup":"2026-10-25T00:00:00Z"},
      "metrics":{"disk":{"value":88}},
      "health":{"verdict":"attention","reasons":[{"code":"backup_stale","detail":"7d"}]}},
     {"id":"g3","type":"oci-container","name":"stopped-one","status":"stopped",
      "proxmox":{"lastBackup":"2026-11-07T00:00:00Z"},"health":{"verdict":"off"}},
     {"id":"s1","type":"storage","name":"local","status":"online","metrics":{"disk":{"value":20}}}
    ],"meta":{"page":1,"limit":100,"total":5,"totalPages":1},"aggregations":{},"facets":{}}
    """#

    private func resources() throws -> [Resource] {
        try JSONDecoder().decode(ResourcesResponse.self, from: Data(fixture.utf8)).data ?? []
    }

    func testPercentRule() {
        XCTAssertEqual(MetricValue(value: 5, percent: 63).pct, 63)
        XCTAssertEqual(MetricValue(value: 5).pct, 5)
        XCTAssertEqual(MetricValue(value: 0, used: 1, total: 4).pct, 25)
        XCTAssertEqual(MetricValue().pct, 0)
    }

    func testDecodesAndSummarises() throws {
        let s = summarize(resources: try resources(), alerts: [])
        XCTAssertEqual(s.nodes.map(\.name), ["node-1"])
        XCTAssertEqual(s.nodes[0].temperatureC, 47.5)
        XCTAssertEqual(s.nodes[0].memory, 63)
        XCTAssertEqual(s.guestsTotal, 3)
        XCTAssertEqual(s.guestsRunning, 2)
        XCTAssertEqual(s.issueCount, 2, "dev-server and nas")
        XCTAssertEqual(s.overall, .bad)
    }

    func testNeverBackedUpSortsFirst() throws {
        let s = summarize(resources: try resources(), alerts: [])
        XCTAssertEqual(s.rows.first, IssueRow(name: "dev-server", text: "No completed backup reported", tone: .bad))
        XCTAssertTrue(s.rows.contains(IssueRow(name: "nas", text: "Last backup 7 days ago", tone: .warn)))
        XCTAssertTrue(s.rows.contains(IssueRow(name: "nas", text: "Disk 88% full", tone: .warn)))
    }

    func testTemperatureIsOptionalAndFallsBack() throws {
        let decode = { (json: String) throws -> Resource in
            try JSONDecoder().decode(Resource.self, from: Data(json.utf8))
        }
        XCTAssertNil(try decode(#"{"id":"a","type":"agent","name":"a"}"#).temperatureC)
        XCTAssertNil(try decode(#"{"id":"a","type":"agent","name":"a","temperature":0}"#).temperatureC, "0 means no reading")
        XCTAssertEqual(try decode(#"{"id":"a","type":"agent","name":"a","proxmox":{"temperature":51}}"#).temperatureC, 51)
        XCTAssertEqual(try decode(#"{"id":"a","type":"agent","name":"a","agent":{"temperature":52}}"#).temperatureC, 52)
    }

    func testHotNodeWarnsEvenWithoutIssues() {
        let r = Resource(id: "n", type: "agent", name: "n", status: "online", temperature: 75, health: nil, metrics: nil, proxmox: nil, agent: nil)
        let s = summarize(resources: [r], alerts: [])
        XCTAssertEqual(s.issueCount, 0)
        XCTAssertEqual(s.overall, .warn)
    }

    func testAlertsCountUnlessAcknowledged() throws {
        let json = #"{"alerts":[{"id":"1","level":"critical","resourceName":"pulse","message":"Down"},{"id":"2","level":"warning","resourceName":"x","acknowledged":true}]}"#
        let alerts = try JSONDecoder().decode(AlertsResponse.self, from: Data(json.utf8)).alerts
        XCTAssertEqual(alerts.count, 2)
        let s = summarize(resources: [], alerts: alerts)
        XCTAssertEqual(s.alertCount, 1)
        XCTAssertEqual(s.overall, .bad)
        XCTAssertEqual(s.rows.first?.text, "Down")
        let bare = try JSONDecoder().decode(AlertsResponse.self, from: Data(#"[{"id":"1"}]"#.utf8))
        XCTAssertEqual(bare.alerts.count, 1)
    }

    func testNormalizesAddress() {
        XCTAssertEqual(PulseConnection.normalize(" pulse.example.com/ "), "https://pulse.example.com")
        XCTAssertEqual(PulseConnection.normalize("https://pulse.example.com"), "https://pulse.example.com")
        XCTAssertEqual(PulseConnection.normalize("http://192.168.1.50:7655"), "http://192.168.1.50:7655")
        XCTAssertEqual(PulseConnection.normalize(""), "")
    }

    func testOnlyHTTPSIsSent() async {
        XCTAssertTrue(PulseConnection(url: "pulse.example.com", token: "t").isHTTPS)
        XCTAssertFalse(PulseConnection(url: "http://192.168.1.50:7655", token: "t").isHTTPS)
        do {
            _ = try await PulseClient(connection: PulseConnection(url: "http://192.168.1.50:7655", token: "t")).summary()
            XCTFail("expected a refusal")
        } catch {
            XCTAssertEqual(error as? PulseError, .httpsRequired)
        }
    }

    func testDemoNeedsNoNetwork() async throws {
        XCTAssertTrue(PulseConnection.demo.isDemo)
        let s = try await PulseClient(connection: .demo).summary()
        XCTAssertEqual(s.nodes.first?.temperatureC, 48)
    }
}
