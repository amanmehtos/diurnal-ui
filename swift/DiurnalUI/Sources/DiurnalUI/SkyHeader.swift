import SwiftUI

/// The sky overhead, drawn — the SwiftUI twin of `sky-header.mjs`.
///
/// An engraving, not a photograph: ink linework at low alpha, the way a book
/// sets a diagram. A bright disc on near-white paper reads as a hole, while a
/// ring with rays reads as the sun in either theme and never needs a hue. The
/// sun is radiant and the moon is solid, because moonlight is reflected — the
/// difference is the drawing, never the colour.
///
///     SkyHeader()                       // live weather, place guessed
///     SkyHeader(height: .tall) { Text("Light Week") }   // something on the sky
///
public struct SkyHeader<Overlay: View>: View {
    public enum Band {
        case short, standard, tall
        /// For a header whose height is already decided by the layout around
        /// it, which is the usual case in an app rather than on a page.
        case points(CGFloat)

        var points: CGFloat {
            switch self {
            case .short: 72
            case .standard: 112
            case .tall: 168
            case .points(let value): value
            }
        }
    }

    private let band: Band
    private let place: Place
    private let overlay: Overlay
    /// Injectable so a preview or a test can pin the sky; nil follows the clock.
    private let fixedDate: Date?
    private let fixedWeather: Weather?

    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var weather: Weather = .clear

    public init(
        height band: Band = .standard,
        place: Place = .guessed,
        date: Date? = nil,
        weather: Weather? = nil,
        @ViewBuilder overlay: () -> Overlay = { EmptyView() }
    ) {
        self.band = band
        self.place = place
        self.fixedDate = date
        self.fixedWeather = weather
        self.overlay = overlay()
    }

    private var current: Weather { fixedWeather ?? weather }

    /// Nothing to animate under a clear sky, and nothing to animate for a
    /// reader who asked for less of it — both get a still frame rather than a
    /// slower one.
    private var moves: Bool {
        !reduceMotion && (current.cloud > 0.02 || current.precip > 0.02)
    }

    public var body: some View {
        ZStack {
            if moves {
                TimelineView(.animation) { timeline in
                    canvas(at: timeline.date.timeIntervalSinceReferenceDate)
                }
            } else {
                canvas(at: 0)
            }
            overlay
        }
        .frame(height: band.points)
        .mask(fade)
        .task(id: place) {
            if fixedWeather == nil { weather = await WeatherStore.shared.current(at: place) }
        }
    }

    /// Dissolves downward into the page, and at both sides, so the band has no
    /// edge anywhere — inset or full width.
    private var fade: some View {
        LinearGradient(
            stops: [.init(color: .black, location: 0.55), .init(color: .clear, location: 1)],
            startPoint: .top, endPoint: .bottom
        )
        .mask(
            LinearGradient(
                stops: [
                    .init(color: .clear, location: 0), .init(color: .black, location: 0.1),
                    .init(color: .black, location: 0.9), .init(color: .clear, location: 1),
                ],
                startPoint: .leading, endPoint: .trailing
            )
        )
    }

    private func canvas(at time: TimeInterval) -> some View {
        Canvas { context, size in
            let source = Sky.lightSource(
                dark: scheme == .dark,
                date: fixedDate ?? Date(),
                latitude: place.latitude,
                longitude: place.longitude
            )
            draw(context, size, source: source, weather: current, time: time)
        }
    }

    // MARK: - the layers, back to front

    private func draw(
        _ context: GraphicsContext, _ size: CGSize,
        source: LightSource, weather: Weather, time: TimeInterval
    ) {
        var context = context
        let ink = Color.dnInk
        let disc = position(of: source, in: size)

        // Skylight, gathering toward the light unless the sky has closed in.
        let closed = min(1, weather.cloud * 0.7 + weather.fog * 0.5)
        context.fill(Path(CGRect(origin: .zero, size: size)), with: .color(ink.opacity(0.05 + 0.06 * closed)))
        if source.altitude > 0, closed < 0.9 {
            let radius = max(size.width * 0.35, size.height * 2)
            context.fill(
                Path(CGRect(origin: .zero, size: size)),
                with: .radialGradient(
                    Gradient(colors: [ink.opacity(0.1 * (1 - closed)), ink.opacity(0)]),
                    center: disc.centre, startRadius: 0, endRadius: radius
                )
            )
        }

        drawDisc(&context, source: source, weather: weather, at: disc, ink: ink)
        drawCloud(&context, size, weather: weather, time: time, ink: ink)
        drawPrecipitation(&context, size, weather: weather, time: time, ink: ink)

        // Fog is the page's own colour laid back over everything, so the sky
        // loses contrast rather than gaining a grey.
        if weather.fog > 0.02 {
            context.fill(
                Path(CGRect(origin: .zero, size: size)),
                with: .color(Color.dnBackground.opacity(min(0.82, weather.fog * 0.8)))
            )
        }
    }

    /// Azimuth runs left to right across the day; altitude lifts it off the
    /// lower edge.
    private func position(of source: LightSource, in size: CGSize) -> (centre: CGPoint, radius: CGFloat) {
        let x = (source.azimuth.truncatingRemainder(dividingBy: 360) / 360) * size.width
        let lift = min(60, source.altitude) / 60
        let y = size.height - 12 - lift * (size.height - 30)
        return (CGPoint(x: x, y: y), max(9, min(20, size.height * 0.17)))
    }

    private func drawDisc(
        _ context: inout GraphicsContext,
        source: LightSource, weather: Weather,
        at disc: (centre: CGPoint, radius: CGFloat), ink: Color
    ) {
        guard source.altitude > 0 else { return }  // below the horizon, only skylight
        let alpha = 0.62 * (1 - weather.cloud * 0.92) * (1 - weather.fog * 0.85)
        guard alpha > 0.03 else { return }

        let (centre, r) = disc
        // A halo first, so the disc sits in light rather than on the page.
        let haloRect = CGRect(
            x: centre.x - r * 3, y: centre.y - r * 3, width: r * 6, height: r * 6
        )
        context.fill(
            Path(ellipseIn: haloRect),
            with: .radialGradient(
                Gradient(colors: [ink.opacity(alpha * 0.22), ink.opacity(0)]),
                center: centre, startRadius: r * 0.5, endRadius: r * 3
            )
        )

        let stroke = StrokeStyle(lineWidth: 1.4, lineCap: .round)
        if source.body == .moon {
            let body = CGRect(
                x: centre.x - r * 0.74, y: centre.y - r * 0.74, width: r * 1.48, height: r * 1.48
            )
            context.fill(Path(ellipseIn: body), with: .color(ink.opacity(alpha * 0.72)))
            context.stroke(Path(ellipseIn: body), with: .color(ink.opacity(alpha)), style: stroke)
        } else {
            let body = CGRect(
                x: centre.x - r * 0.58, y: centre.y - r * 0.58, width: r * 1.16, height: r * 1.16
            )
            context.stroke(Path(ellipseIn: body), with: .color(ink.opacity(alpha)), style: stroke)
            var rays = Path()
            for i in 0..<12 {
                let angle = Double(i) / 12 * 2 * Double.pi
                let ux = CGFloat(cos(angle))
                let uy = CGFloat(sin(angle))
                let inner = r * (i % 2 == 1 ? 0.8 : 0.86)
                let outer = r * (i % 2 == 1 ? 1.12 : 1.3)
                rays.move(to: CGPoint(x: centre.x + ux * inner, y: centre.y + uy * inner))
                rays.addLine(to: CGPoint(x: centre.x + ux * outer, y: centre.y + uy * outer))
            }
            context.stroke(rays, with: .color(ink.opacity(alpha)), style: stroke)
        }
    }

    private func drawCloud(
        _ context: inout GraphicsContext, _ size: CGSize,
        weather: Weather, time: TimeInterval, ink: Color
    ) {
        let cover = weather.cloud
        guard cover > 0.02 else { return }
        let banks = Int(1 + cover * 3)

        for bank in 0...banks {
            let depth = Double(bank + 1) / Double(banks + 1)  // 1 is nearest
            let span = size.width + 240
            let drift = (CGFloat(time) * 4 * CGFloat(depth)).truncatingRemainder(dividingBy: span)

            var shape = Path()
            for i in 0..<7 {
                let seed = bank * 7 + i
                let x = (noise(seed) * span + drift).truncatingRemainder(dividingBy: span) - 120
                let lift = CGFloat(0.18 + 0.5 * (1 - depth))
                let y = size.height * lift + noise(seed, 1) * size.height * 0.1
                let rx = (18 + noise(seed, 2) * 42) * CGFloat(0.6 + depth * 0.7)
                let ry = rx * (0.34 + noise(seed, 3) * 0.16)
                shape.addEllipse(in: CGRect(x: x - rx, y: y - ry, width: rx * 2, height: ry * 2))
            }

            // Blurred, because a cloud has no edge. Hard overlapping ellipses
            // read as blobs; nearer banks are a little sharper, which is most
            // of what makes them read as nearer.
            var layer = context
            layer.addFilter(.blur(radius: 14 - depth * 7))
            layer.fill(shape, with: .color(ink.opacity(0.06 + 0.12 * cover * depth)))
        }
    }

    private func drawPrecipitation(
        _ context: inout GraphicsContext, _ size: CGSize,
        weather: Weather, time: TimeInterval, ink: Color
    ) {
        guard weather.precip > 0.02 else { return }
        let total = Int(size.width / 6)
        let count = Int(Double(total) * weather.precip)
        guard count > 0 else { return }
        let colour = ink.opacity(0.3 * weather.precip + 0.08)

        if weather.isFrozen {
            var flakes = Path()
            for i in 0..<count {
                let waver = CGFloat(sin((time * 1.2 + Double(i)) * 1.3)) * 6
                let x = noise(i) * size.width + waver
                let fall = noise(i, 1) * size.height + CGFloat(time) * 16 * (0.55 + noise(i, 3) * 0.7)
                let y = fall.truncatingRemainder(dividingBy: size.height + 12)
                flakes.addEllipse(in: CGRect(x: x - 1.1, y: y - 1.1, width: 2.2, height: 2.2))
            }
            context.fill(flakes, with: .color(colour))
        } else {
            var streaks = Path()
            for i in 0..<count {
                let x = noise(i) * size.width
                let length = 6 + noise(i, 2) * 10
                let fall = noise(i, 1) * size.height + CGFloat(time) * 90 * (0.55 + noise(i, 3) * 0.7)
                let y = fall.truncatingRemainder(dividingBy: size.height + 20)
                streaks.move(to: CGPoint(x: x, y: y))
                streaks.addLine(to: CGPoint(x: x - 2.5, y: y + length))
            }
            context.stroke(streaks, with: .color(colour), lineWidth: 1)
        }
    }

    /// A fixed shuffle, so the banks and the rain do not re-deal themselves on
    /// every frame. Seeded by index alone: the same drop is always the same drop.
    private func noise(_ i: Int, _ salt: Int = 0) -> CGFloat {
        let x = sin(Double(i) * 127.1 + Double(salt) * 311.7) * 43758.5453
        return CGFloat(x - floor(x))
    }
}
