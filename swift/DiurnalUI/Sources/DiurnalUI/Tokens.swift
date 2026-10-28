import SwiftUI

/// The palette, as `diurnal.css` sets it.
///
/// Monochrome by rule: ink, paper and greys, and no hue anywhere. Emphasis
/// comes from contrast and elevation, never from colour — which is why there
/// is no accent here to reach for.
///
/// These values are duplicated from the stylesheet, because a Swift view
/// cannot read a CSS custom property. Duplication that nobody checks is how
/// two palettes quietly become two designs, so `TokenParityTests` parses
/// `diurnal.css` and fails if any of these stops matching.
public enum DiurnalTokens {
    public struct Palette: Sendable {
        public let bg: String
        public let surface: String
        public let raised: String
        public let sunken: String
        public let ink: String
        public let ink2: String
        public let muted: String
        public let line: String
        public let lineStrong: String
        public let danger: String
    }

    /// Lit by the sun.
    public static let day = Palette(
        bg: "#efefed", surface: "#fafaf9", raised: "#ffffff", sunken: "#e6e6e3",
        ink: "#141414", ink2: "#3d3d3c", muted: "#6e6e6b",
        line: "#d3d3cf", lineStrong: "#a9a9a4", danger: "#ae3b31"
    )

    /// Lit by a full moon, which sits opposite the sun.
    public static let night = Palette(
        bg: "#0b0b0c", surface: "#18181a", raised: "#242427", sunken: "#0e0e0f",
        ink: "#ececea", ink2: "#c2c2bf", muted: "#85857f",
        line: "#2e2e31", lineStrong: "#4a4a4f", danger: "#e0796e"
    )

    /// Keyed by the custom property each value comes from, for the parity test.
    public static func named(_ p: Palette) -> [String: String] {
        [
            "--dn-bg": p.bg, "--dn-surface": p.surface, "--dn-raised": p.raised,
            "--dn-sunken": p.sunken, "--dn-ink": p.ink, "--dn-ink-2": p.ink2,
            "--dn-muted": p.muted, "--dn-line": p.line,
            "--dn-line-strong": p.lineStrong, "--dn-danger": p.danger,
        ]
    }

    /// `--dn-radius` and `--dn-radius-sm`.
    public static let radius: CGFloat = 8
    public static let radiusSmall: CGFloat = 6

    /// `--dn-ease`. The light moves slowly; nothing about it should snap.
    public static let lightEase = Animation.timingCurve(0.2, 0.7, 0.2, 1, duration: 1.6)
}

public extension Color {
    /// A token that follows the colour scheme, the way a custom property does.
    static func dn(_ day: String, _ night: String) -> Color {
        #if canImport(UIKit)
        return Color(UIColor { $0.userInterfaceStyle == .dark
            ? UIColor(hex: night) : UIColor(hex: day) })
        #else
        return Color(hex: day)
        #endif
    }

    static var dnBackground: Color { .dn(DiurnalTokens.day.bg, DiurnalTokens.night.bg) }
    static var dnSurface: Color { .dn(DiurnalTokens.day.surface, DiurnalTokens.night.surface) }
    static var dnRaised: Color { .dn(DiurnalTokens.day.raised, DiurnalTokens.night.raised) }
    static var dnSunken: Color { .dn(DiurnalTokens.day.sunken, DiurnalTokens.night.sunken) }
    static var dnInk: Color { .dn(DiurnalTokens.day.ink, DiurnalTokens.night.ink) }
    static var dnInk2: Color { .dn(DiurnalTokens.day.ink2, DiurnalTokens.night.ink2) }
    static var dnMuted: Color { .dn(DiurnalTokens.day.muted, DiurnalTokens.night.muted) }
    static var dnLine: Color { .dn(DiurnalTokens.day.line, DiurnalTokens.night.line) }
    static var dnLineStrong: Color {
        .dn(DiurnalTokens.day.lineStrong, DiurnalTokens.night.lineStrong)
    }
    static var dnDanger: Color { .dn(DiurnalTokens.day.danger, DiurnalTokens.night.danger) }

    init(hex: String) {
        let trimmed = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var value: UInt64 = 0
        Scanner(string: trimmed).scanHexInt64(&value)
        self.init(
            red: Double((value >> 16) & 0xff) / 255,
            green: Double((value >> 8) & 0xff) / 255,
            blue: Double(value & 0xff) / 255
        )
    }
}

#if canImport(UIKit)
import UIKit

extension UIColor {
    convenience init(hex: String) {
        let trimmed = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var value: UInt64 = 0
        Scanner(string: trimmed).scanHexInt64(&value)
        self.init(
            red: CGFloat((value >> 16) & 0xff) / 255,
            green: CGFloat((value >> 8) & 0xff) / 255,
            blue: CGFloat(value & 0xff) / 255,
            alpha: 1
        )
    }
}
#endif
