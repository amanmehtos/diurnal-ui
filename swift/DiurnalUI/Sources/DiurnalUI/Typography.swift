import SwiftUI

/// Set like a novel.
///
/// The stylesheet asks for Libre Baskerville for everything but code, and IBM
/// Plex Mono for code. Neither ships with iOS, and bundling a book face to be
/// *nearly* right is a poor trade when the system already has one: New York is
/// Apple's own serif, optically sized for these screens and hinted for them,
/// where a webfont dropped into an app is neither. So the rule the system
/// actually cares about — a serif for reading, a monospace for anything
/// tabular — is kept, and the specific face is the platform's.
///
/// Swap in Libre Baskerville by registering it and changing these two
/// functions; nothing else refers to a font by name.
public enum DiurnalType {
    /// The book face, for everything that is read.
    public static func body(_ style: Font.TextStyle = .body, weight: Font.Weight = .regular) -> Font {
        .system(style, design: .serif).weight(weight)
    }

    /// For code, counts, times — anything that should line up in a column.
    public static func mono(_ style: Font.TextStyle = .body, weight: Font.Weight = .regular) -> Font {
        .system(style, design: .monospaced).weight(weight)
    }

    /// A running head: small capitals, letter-spaced, the quietest thing on
    /// the page. `.dn-eyebrow` in the stylesheet.
    public static let eyebrowTracking: CGFloat = 1.6
}

public extension View {
    /// `.dn-eyebrow`: the label above a title that names the section.
    func dnEyebrow() -> some View {
        self.font(DiurnalType.body(.caption2, weight: .semibold))
            .tracking(DiurnalType.eyebrowTracking)
            .textCase(.uppercase)
            .foregroundStyle(Color.dnMuted)
    }
}
