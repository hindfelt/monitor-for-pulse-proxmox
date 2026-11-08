// swift-tools-version:5.9
// Lets the Foundation-only logic in Shared/ be tested with `swift test`, on macOS or Linux.
// The app and widget themselves are built from PulseWidget.xcodeproj.
import PackageDescription

let package = Package(
    name: "PulseCore",
    platforms: [.macOS(.v14)],
    products: [.library(name: "PulseCore", targets: ["PulseCore"])],
    targets: [
        .target(name: "PulseCore", path: "Shared"),
        .testTarget(name: "PulseCoreTests", dependencies: ["PulseCore"], path: "Tests/PulseCoreTests"),
    ]
)
