//! Baseball Savant / Statcast enrichment (Phase 4b — optional, feature-flagged).
//!
//! This is a *separate* undocumented API from the Stats API, with its own host, its own
//! shapes, and its own failure modes, so it is kept out of `client.rs`. Nothing in the
//! app may depend on it: every caller must degrade to the Stats API views when this
//! returns `Err` or an empty set.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::client::MlbClient;
use super::endpoints;
use crate::error::Result;

/// One Statcast-measured pitch, keyed back to the Stats API by `play_id`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct StatcastPitch {
    /// Matches `PlayEvent::play_id` in the live feed — the join key between the two APIs.
    #[serde(default)]
    pub play_id: Option<String>,
    #[serde(default)]
    pub pitch_type: Option<String>,
    #[serde(default)]
    pub start_speed: Option<f64>,
    /// Horizontal plate location, feet from centre.
    #[serde(default)]
    pub px: Option<f64>,
    /// Plate height, feet.
    #[serde(default)]
    pub pz: Option<f64>,
    #[serde(default)]
    pub hit_speed: Option<f64>,
    #[serde(default)]
    pub hit_angle: Option<f64>,
    #[serde(default)]
    pub hit_distance: Option<f64>,
    /// Batted-ball landing coordinates on the field diagram.
    #[serde(default)]
    pub hc_x: Option<f64>,
    #[serde(default)]
    pub hc_y: Option<f64>,
    #[serde(default)]
    pub inning: Option<i64>,
}

#[derive(Debug, Clone, Default, Deserialize)]
struct SavantGameFeed {
    #[serde(default)]
    team_home: Vec<StatcastPitch>,
    #[serde(default)]
    team_away: Vec<StatcastPitch>,
}

/// Statcast data for one game, indexed by `play_id` so the UI can look up a pitch in O(1).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatcastGame {
    pub game_pk: i64,
    /// Keyed by `play_id`. Pitches Savant did not measure are simply absent.
    pub pitches: HashMap<String, StatcastPitch>,
}

pub async fn fetch_statcast(client: &MlbClient, game_pk: i64) -> Result<StatcastGame> {
    let feed: SavantGameFeed = client.get_json(&endpoints::savant_game(game_pk)).await?;

    let mut pitches = HashMap::new();
    for p in feed.team_home.into_iter().chain(feed.team_away) {
        if let Some(id) = p.play_id.clone() {
            pitches.insert(id, p);
        }
    }

    Ok(StatcastGame { game_pk, pitches })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn indexes_both_teams_by_play_id() {
        let json = r#"{
            "team_home": [{"play_id": "h1", "start_speed": 95.2, "pitch_type": "FF"}],
            "team_away": [{"play_id": "a1", "start_speed": 88.0, "pitch_type": "SL"}],
            "some_field_we_ignore": 42
        }"#;
        let feed: SavantGameFeed = serde_json::from_str(json).unwrap();
        assert_eq!(feed.team_home.len(), 1);
        assert_eq!(feed.team_away.len(), 1);
    }

    #[test]
    fn pitches_without_a_play_id_are_dropped() {
        // Without a play_id there is nothing to join against, so the row is useless.
        let json = r#"{"team_home": [{"start_speed": 95.2}], "team_away": []}"#;
        let feed: SavantGameFeed = serde_json::from_str(json).unwrap();
        assert!(feed.team_home[0].play_id.is_none());
    }
}
