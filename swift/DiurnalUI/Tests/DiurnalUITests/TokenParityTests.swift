import XCTest
@testable import DiurnalUI

/// The Swift palette against the stylesheet's.
///
/// A wrong grey is not something a compiler can catch and not something a
/// glance reliably catches either, so the two copies are compared directly.
/// The CSS is the original: if this fails, the Swift is what is wrong.
final class TokenParityTests: XCTestCase {
    private func css() throws -> String {
        // ../../.. from Sources/…/Tests → the repository root beside diurnal.css.
        let here = URL(fileURLWithPath: #filePath)
        let root = here
            .deletingLastPathComponent()  // DiurnalUITests
            .deletingLastPathComponent()  // Tests
            .deletingLastPathComponent()  // DiurnalUI
            .deletingLastPathComponent()  // swift
            .deletingLastPathComponent()  // diurnal-ui
        return try String(contentsOf: root.appendingPathComponent("diurnal.css"), encoding: .utf8)
    }

    /// Reads one `--dn-*` value out of a block, which is enough parsing for a
    /// file whose shape we control.
    private func value(_ name: String, inBlockAfter marker: String, of source: String) throws -> String {
        let start = try XCTUnwrap(source.range(of: marker), "no \(marker) block")
        let rest = source[start.upperBound...]
        let end = try XCTUnwrap(rest.range(of: "}"), "unterminated \(marker) block")
        let block = rest[..<end.lowerBound]
        let line = try XCTUnwrap(
            block.range(of: "\(name):"), "\(name) missing from \(marker)"
        )
        let after = block[line.upperBound...]
        let semi = try XCTUnwrap(after.range(of: ";"))
        return after[..<semi.lowerBound].trimmingCharacters(in: .whitespaces).lowercased()
    }

    func testDayPaletteMatchesTheStylesheet() throws {
        let source = try css()
        for (name, swift) in DiurnalTokens.named(DiurnalTokens.day) {
            let fromCSS = try value(name, inBlockAfter: ":root {", of: source)
            XCTAssertEqual(swift.lowercased(), fromCSS, "\(name) has drifted")
        }
    }

    func testNightPaletteMatchesTheStylesheet() throws {
        let source = try css()
        for (name, swift) in DiurnalTokens.named(DiurnalTokens.night) {
            let fromCSS = try value(name, inBlockAfter: ":root[data-dn-theme='dark'] {", of: source)
            XCTAssertEqual(swift.lowercased(), fromCSS, "\(name) has drifted")
        }
    }
}
