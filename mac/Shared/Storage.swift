import Foundation
#if canImport(Security)
import Security

/// The address and token, stored together in a Keychain item the app and widget share
/// through the `keychain-access-groups` entitlement.
public enum ConnectionStore {
    private static let service = "com.hindfelt.pulsemobile.mac.connection"
    private static let account = "default"

    private static var base: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecUseDataProtectionKeychain as String: true,
        ]
    }

    public static func load() -> PulseConnection? {
        var query = base
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return nil }
        return try? JSONDecoder().decode(PulseConnection.self, from: data)
    }

    /// Returns false if the Keychain refused, which usually means the app isn't signed with a team.
    @discardableResult
    public static func save(_ connection: PulseConnection) -> Bool {
        guard let data = try? JSONEncoder().encode(connection) else { return false }
        SecItemDelete(base as CFDictionary)
        var add = base
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        return SecItemAdd(add as CFDictionary, nil) == errSecSuccess
    }

    public static func clear() {
        SecItemDelete(base as CFDictionary)
    }
}
#endif

/// The last good reading. The app writes it and the widget reads it, through a shared App Group container.
public enum SummaryCache {
    /// Must match `com.apple.security.application-groups` in both entitlements files.
    private static let appGroup = "MFFD9U3PAR.com.hindfelt.pulsemobile.mac"

    private static var file: URL? {
        #if canImport(Security)
        if let shared = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) {
            return shared.appendingPathComponent("pulse-summary.json")
        }
        #endif
        return FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first?.appendingPathComponent("pulse-summary.json")
    }

    public static func load() -> PulseSummary? {
        guard let file, let data = try? Data(contentsOf: file) else { return nil }
        return try? JSONDecoder().decode(PulseSummary.self, from: data)
    }

    public static func save(_ summary: PulseSummary) {
        guard let file, let data = try? JSONEncoder().encode(summary) else { return }
        try? data.write(to: file, options: .atomic)
    }

    public static func clear() {
        guard let file else { return }
        try? FileManager.default.removeItem(at: file)
    }
}
