import Foundation
import Security

/// Reads the connection the app shares through Keychain Sharing (see shareWithWidget in src/lib/store.ts).
enum ConnectionStore {
    static func load() -> PulseConnection? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: Data("pulse.widget.connection".utf8),
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return nil }
        return try? JSONDecoder().decode(PulseConnection.self, from: data)
    }
}

/// The widget's last good reading, shown when Pulse can't be reached.
enum SummaryCache {
    private static var file: URL? {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first?.appendingPathComponent("pulse-summary.json")
    }

    static func load() -> PulseSummary? {
        guard let file, let data = try? Data(contentsOf: file) else { return nil }
        return try? JSONDecoder().decode(PulseSummary.self, from: data)
    }

    static func save(_ summary: PulseSummary) {
        guard let file, let data = try? JSONEncoder().encode(summary) else { return }
        try? data.write(to: file, options: .atomic)
    }
}
