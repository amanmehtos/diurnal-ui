import Foundation

/// The weather, as the parts that matter to light.
///
/// A port of the same struct `sky.mjs` builds: not a forecast, just how much
/// gets through. Each value is 0...1.
public struct Weather: Sendable, Equatable {
    public var label: String
    /// Cloud cover.
    public var cloud: Double
    /// How little can be seen through the air.
    public var fog: Double
    /// Falling water, or snow — see `isFrozen`.
    public var precip: Double
    /// The WMO code, kept because it is the only thing that says *what* is
    /// falling. Precipitation alone cannot tell snow from rain.
    public var code: Int

    public init(label: String, cloud: Double, fog: Double, precip: Double, code: Int) {
        self.label = label
        self.cloud = cloud
        self.fog = fog
        self.precip = precip
        self.code = code
    }

    public static let clear = Weather(label: "Clear", cloud: 0, fog: 0, precip: 0, code: 0)

    /// Snowfall, snow grains and snow showers.
    public var isFrozen: Bool { (code >= 71 && code <= 77) || code == 85 || code == 86 }

    /// How diffuse the light is: 0 is hard and direct, 1 is no direct light.
    public var diffusion: Double { min(1, cloud * 0.8 + fog * 0.7 + precip * 0.25) }

    /// Maps Open-Meteo's `current` block, exactly as `weatherFromOpenMeteo` does.
    public static func fromOpenMeteo(
        code: Int, cloudCover: Double?, precipitation: Double?, visibility: Double?
    ) -> Weather {
        let cloud = min(1, max(0, (cloudCover ?? 0) / 100))
        let fog: Double
        if code == 45 || code == 48 {
            fog = 1
        } else if let visibility {
            fog = max(0, min(1, (10_000 - visibility) / 9_000))
        } else {
            fog = 0
        }
        let wet = (code >= 51 && code <= 67) || (code >= 71 && code <= 77) || code >= 80
        let precip = wet ? min(1, 0.4 + (precipitation ?? 0) / 4) : 0
        let label = wmo[code] ?? (cloud > 0.85 ? "Overcast" : cloud > 0.3 ? "Partly cloudy" : "Clear")
        return Weather(label: label, cloud: cloud, fog: fog, precip: precip, code: code)
    }

    private static let wmo: [Int: String] = [
        0: "Clear", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog",
        48: "Rime fog", 51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
        56: "Freezing drizzle", 57: "Freezing drizzle", 61: "Light rain", 63: "Rain",
        65: "Heavy rain", 66: "Freezing rain", 67: "Freezing rain", 71: "Light snow",
        73: "Snow", 75: "Heavy snow", 77: "Snow grains", 80: "Showers", 81: "Showers",
        82: "Violent showers", 85: "Snow showers", 86: "Snow showers", 95: "Thunderstorm",
        96: "Thunderstorm, hail", 99: "Thunderstorm, hail",
    ]
}

/// Where the viewer is, well enough to place the sun.
public struct Place: Sendable, Equatable {
    public var latitude: Double
    public var longitude: Double

    public init(latitude: Double, longitude: Double) {
        self.latitude = latitude
        self.longitude = longitude
    }

    /// The same guess the web makes: longitude from the time zone, latitude a
    /// default. Deliberately not Core Location — the sky is ambient, and
    /// nothing here is worth a permission prompt.
    public static var guessed: Place {
        Place(latitude: 20, longitude: Double(TimeZone.current.secondsFromGMT()) / 240)
    }
}

/// Live conditions from Open-Meteo: free, keyless, and the same endpoint the
/// web uses. Cached for fifteen minutes, because the sky does not change
/// faster than that and a timer app should not wake the radio to find out.
public actor WeatherStore {
    public static let shared = WeatherStore()

    private struct Cached { let at: Date; let place: Place; let weather: Weather }
    private var cached: Cached?
    private let ttl: TimeInterval = 15 * 60

    public init() {}

    public func current(at place: Place) async -> Weather {
        if let cached, cached.place == place, Date().timeIntervalSince(cached.at) < ttl {
            return cached.weather
        }
        guard let weather = await fetch(place) else { return cached?.weather ?? .clear }
        cached = Cached(at: Date(), place: place, weather: weather)
        return weather
    }

    private func fetch(_ place: Place) async -> Weather? {
        // Rounded to 0.1°, as the web does: it is all the precision the sky
        // needs and it keeps the request cacheable.
        var components = URLComponents(string: "https://api.open-meteo.com/v1/forecast")
        components?.queryItems = [
            .init(name: "latitude", value: String(format: "%.1f", place.latitude)),
            .init(name: "longitude", value: String(format: "%.1f", place.longitude)),
            .init(name: "current", value: "cloud_cover,weather_code,precipitation,visibility"),
        ]
        guard let url = components?.url else { return nil }

        struct Response: Decodable {
            struct Current: Decodable {
                let weather_code: Int?
                let cloud_cover: Double?
                let precipitation: Double?
                let visibility: Double?
            }
            let current: Current
        }

        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            let body = try JSONDecoder().decode(Response.self, from: data)
            return Weather.fromOpenMeteo(
                code: body.current.weather_code ?? 0,
                cloudCover: body.current.cloud_cover,
                precipitation: body.current.precipitation,
                visibility: body.current.visibility
            )
        } catch {
            // A sky that cannot be reached is not an error worth surfacing:
            // the header simply shows a clear one.
            return nil
        }
    }
}
