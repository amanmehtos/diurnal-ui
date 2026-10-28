import XCTest
@testable import DiurnalUI

/// The sun maths, checked against the JavaScript rather than against itself.
///
/// Every expected value below was produced by running `lightSource()` from
/// `sky.mjs` on exactly these inputs. That provenance is the point: a port
/// that only agrees with its own idea of the formula will pass its tests and
/// still put the sun somewhere else, and nothing about the drawing would look
/// obviously wrong — it would just be the wrong sky.
///
/// The cases cover both solstices, the equator, a sub-polar latitude in
/// summer, the southern hemisphere, and both bodies.
final class SkyParityTests: XCTestCase {
    private struct Vector {
        let dark: Bool
        let iso: String
        let lat: Double
        let lon: Double
        let body: LightSource.Body
        let altitude: Double
        let azimuth: Double
    }

    private let vectors: [Vector] = [
        .init(dark: false, iso: "2026-06-21T12:00:00Z", lat: 51.5, lon: -0.1,
              body: .sun, altitude: 61.939025807, azimuth: 179.804961064),
        .init(dark: false, iso: "2026-12-21T12:00:00Z", lat: 51.5, lon: -0.1,
              body: .sun, altitude: 15.059948386, azimuth: 179.904989093),
        .init(dark: false, iso: "2026-03-20T06:00:00Z", lat: 13.75, lon: 100.5,
              body: .sun, altitude: 72.025115116, azimuth: 216.188889213),
        .init(dark: false, iso: "2026-10-28T04:00:00Z", lat: 13.75, lon: 100.5,
              body: .sun, altitude: 56.176810537, azimuth: 144.421134845),
        .init(dark: true, iso: "2026-10-28T04:00:00Z", lat: 13.75, lon: 100.5,
              body: .moon, altitude: -56.176810537, azimuth: 324.421134845),
        .init(dark: true, iso: "2026-01-15T22:30:00Z", lat: -33.9, lon: 151.2,
              body: .moon, altitude: -43.324283749, azimuth: 268.15988686),
        .init(dark: false, iso: "2026-09-01T00:00:00Z", lat: 0, lon: 0,
              body: .sun, altitude: -82.183491822, azimuth: 0),
        .init(dark: false, iso: "2026-07-04T18:45:00Z", lat: 64.1, lon: -21.9,
              body: .sun, altitude: 25.112329516, azimuth: 271.064484512),
        .init(dark: true, iso: "2026-02-28T09:15:00Z", lat: 28.6, lon: 77.2,
              body: .moon, altitude: -39.017634681, azimuth: 48.314250574),
    ]

    private func date(_ iso: String) throws -> Date {
        let f = ISO8601DateFormatter()
        f.timeZone = TimeZone(secondsFromGMT: 0)
        return try XCTUnwrap(f.date(from: iso), "could not read \(iso)")
    }

    func testMatchesTheJavaScript() throws {
        for v in vectors {
            let got = Sky.lightSource(
                dark: v.dark, date: try date(v.iso), latitude: v.lat, longitude: v.lon
            )
            XCTAssertEqual(got.body, v.body, "wrong body for \(v.iso)")
            // A ten-thousandth of a degree: far tighter than the formulas are
            // accurate, which is what makes this a parity check rather than an
            // astronomy one.
            XCTAssertEqual(got.altitude, v.altitude, accuracy: 1e-4, "altitude at \(v.iso)")
            XCTAssertEqual(got.azimuth, v.azimuth, accuracy: 1e-4, "azimuth at \(v.iso)")
        }
    }

    /// The moon is the sun twelve hours on, at the opposite declination, so at
    /// one instant and place the two are exact opposites. Worth asserting on
    /// its own: it is the one relationship a plausible-looking port can get
    /// backwards while still matching a single vector.
    func testTheMoonSitsOppositeTheSun() throws {
        let when = try date("2026-10-28T04:00:00Z")
        let sun = Sky.lightSource(dark: false, date: when, latitude: 13.75, longitude: 100.5)
        let moon = Sky.lightSource(dark: true, date: when, latitude: 13.75, longitude: 100.5)
        XCTAssertEqual(moon.altitude, -sun.altitude, accuracy: 1e-9)
        XCTAssertEqual(
            (moon.azimuth - sun.azimuth).truncatingRemainder(dividingBy: 360), 180, accuracy: 1e-9
        )
    }

    func testDayOfYearMatchesTheJavaScriptOrigin() throws {
        // `Date.UTC(y, 0, 0)` is 31 December of the previous year, so 28
        // October 2026 is day 301 and its declination is -14.021360634.
        let when = try date("2026-10-28T04:00:00Z")
        XCTAssertEqual(Sky.dayOfYear(when), 301)
        XCTAssertEqual(Sky.declination(dayOfYear: 301), -14.021360634, accuracy: 1e-6)
    }
}
