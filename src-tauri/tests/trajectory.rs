//! The nine trajectory parameters, checked against a real captured feed.
//!
//! The ball-path preview integrates these by hand, so a field silently going missing or
//! being renamed would turn every pitch into "no tracking data" with nothing in the log
//! to say why. This test reproduces MLB's own published plate location from the nine
//! numbers: if the parse is right the model is right, and if either drifts, this fails.

use ballview_lib::mlb::models::*;

/// Front edge of the plate, in feet — where `pX`/`pZ` are measured.
const PLATE_FRONT_Y: f64 = 17.0 / 12.0;

fn fixture(name: &str) -> String {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures")
        .join(name);
    std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("could not read fixture {}: {e}", path.display()))
}

/// The physical root of `0.5·aY·t² + vY0·t + (y0 − y) = 0` — the one nearest t = 0.
fn time_at_y(c: &PitchCoordinates, y: f64) -> f64 {
    let a = 0.5 * c.a_y.unwrap();
    let b = c.v_y0.unwrap();
    let k = c.y0.unwrap() - y;
    let root = (b * b - 4.0 * a * k).sqrt();
    let t1 = (-b - root) / (2.0 * a);
    let t2 = (-b + root) / (2.0 * a);
    if t1.abs() <= t2.abs() {
        t1
    } else {
        t2
    }
}

#[test]
fn tracked_pitches_carry_the_full_trajectory() {
    let feed: LiveFeed = serde_json::from_str(&fixture("live_feed_822688.json")).unwrap();
    let plays = feed
        .live_data
        .as_ref()
        .and_then(|d| d.plays.as_ref())
        .map(|p| p.all_plays.as_slice())
        .expect("no plays in the feed");

    let tracked: Vec<&PitchCoordinates> = plays
        .iter()
        .flat_map(|p| p.play_events.iter())
        .filter(|e| e.is_pitch == Some(true))
        .filter_map(|e| e.pitch_data.as_ref())
        .filter_map(|d| d.coordinates.as_ref())
        .filter(|c| c.x0.is_some() && c.v_y0.is_some() && c.a_y.is_some())
        .collect();

    assert_eq!(
        tracked.len(),
        291,
        "the feed stopped reporting trajectory parameters on some pitches"
    );

    for c in tracked {
        let t = time_at_y(c, PLATE_FRONT_Y);
        let x = c.x0.unwrap() + c.v_x0.unwrap() * t + 0.5 * c.a_x.unwrap() * t * t;
        let z = c.z0.unwrap() + c.v_z0.unwrap() * t + 0.5 * c.a_z.unwrap() * t * t;

        // A thousandth of a foot is a hundredth of an inch — far tighter than anything
        // the drawing needs, and loose enough to absorb MLB's own rounding.
        assert!(
            (x - c.p_x.unwrap()).abs() < 1e-3,
            "integrated pX {x} does not match the published {}",
            c.p_x.unwrap()
        );
        assert!(
            (z - c.p_z.unwrap()).abs() < 1e-3,
            "integrated pZ {z} does not match the published {}",
            c.p_z.unwrap()
        );
    }
}
