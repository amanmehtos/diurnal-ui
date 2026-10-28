// swift-tools-version: 5.9
import PackageDescription

/// Diurnal UI for SwiftUI.
///
/// The CSS lives beside this, in the same repository, and so should the Swift —
/// a design system with two implementations kept in two different places is a
/// design system with two palettes. The tokens here are checked against
/// `diurnal.css`, and the sun maths against `sky.mjs`, so neither can drift
/// quietly.
let package = Package(
    name: "DiurnalUI",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "DiurnalUI", targets: ["DiurnalUI"])
    ],
    targets: [
        .target(name: "DiurnalUI"),
        .testTarget(name: "DiurnalUITests", dependencies: ["DiurnalUI"]),
    ]
)
