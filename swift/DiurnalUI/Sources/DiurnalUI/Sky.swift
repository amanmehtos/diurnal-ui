import Foundation

/// Where the light is coming from.
///
/// A port of `sky.mjs`, formula for formula. Light mode is lit by the sun and
/// dark mode by a full moon, and a full moon sits opposite the sun — so it is
/// modelled as the sun twelve hours on at the opposite declination, which is
/// why it rises at sunset and crosses the meridian at midnight.
///
/// These are the standard low-precision solar formulas, good to a degree or
/// two. That is plenty for a shadow, and plenty for a drawing of the sky.
public struct LightSource: Sendable, Equatable {
    public enum Body: String, Sendable { case sun, moon }

    public var body: Body
    /// Degrees above the horizon. Negative below it.
    public var altitude: Double
    /// Degrees from north, clockwise.
    public var azimuth: Double

    public init(body: Body, altitude: Double, azimuth: Double) {
        self.body = body
        self.altitude = altitude
        self.azimuth = azimuth
    }
}

public enum Sky {
    private static let rad = Double.pi / 180

    /// Days since 31 December of the previous year, matching `Date.UTC(y, 0, 0)`.
    public static func dayOfYear(_ date: Date) -> Int {
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(secondsFromGMT: 0)!
        let year = utc.component(.year, from: date)
        var start = DateComponents()
        start.year = year - 1
        start.month = 12
        start.day = 31
        guard let origin = utc.date(from: start) else { return 0 }
        return Int(floor(date.timeIntervalSince(origin) / 86_400))
    }

    /// Solar declination in degrees for a day of the year.
    public static func declination(dayOfYear day: Int) -> Double {
        -23.44 * cos((2 * Double.pi / 365) * (Double(day) + 10))
    }

    /// Altitude and azimuth of a body at `hourAngle`, seen from `latitude`.
    public static func horizontal(
        latitude: Double,
        declination decl: Double,
        hourAngle: Double
    ) -> (altitude: Double, azimuth: Double) {
        let phi = latitude * rad, delta = decl * rad, hour = hourAngle * rad
        let alt = asin(sin(phi) * sin(delta) + cos(phi) * cos(delta) * cos(hour))
        let azFromSouth = atan2(sin(hour), cos(hour) * sin(phi) - tan(delta) * cos(phi))
        var az = (azFromSouth / rad + 180).truncatingRemainder(dividingBy: 360)
        az = (az + 360).truncatingRemainder(dividingBy: 360)
        return (alt / rad, az)
    }

    /// The light source for a theme, time and place.
    public static func lightSource(
        dark: Bool,
        date: Date,
        latitude: Double,
        longitude: Double
    ) -> LightSource {
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(secondsFromGMT: 0)!
        let parts = utc.dateComponents([.hour, .minute, .second], from: date)
        let utcHours =
            Double(parts.hour ?? 0)
            + Double(parts.minute ?? 0) / 60
            + Double(parts.second ?? 0) / 3600

        let solarTime = utcHours + longitude / 15
        var hourAngle = 15 * (solarTime - 12)
        var decl = declination(dayOfYear: dayOfYear(date))
        if dark {
            hourAngle += 180
            decl = -decl
        }
        let place = horizontal(latitude: latitude, declination: decl, hourAngle: hourAngle)
        return LightSource(
            body: dark ? .moon : .sun,
            altitude: place.altitude,
            azimuth: place.azimuth
        )
    }
}
