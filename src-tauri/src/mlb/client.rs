//! The shared HTTP client for all external calls.
//!
//! One `reqwest::Client` is built per app run and reused, so connections are pooled.
//! Retries are deliberately conservative: the Stats API publishes no rate limits, so
//! ballview backs off rather than hammering it.

use std::time::Duration;

use serde::de::DeserializeOwned;

use crate::error::{Error, Result};

const USER_AGENT: &str = concat!("ballview/", env!("CARGO_PKG_VERSION"), " (+desktop app)");
const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);
/// The budget for the handful of requests that are genuinely large.
///
/// A day's schedule hydrated with every game's highlight reel is a couple of megabytes
/// and MLB takes its time assembling it — measured at well over the ordinary twenty
/// seconds. A poll-driven request must never wait this long, so the long budget is opted
/// into per call rather than raised for everything.
const SLOW_REQUEST_TIMEOUT: Duration = Duration::from_secs(90);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_ATTEMPTS: u32 = 3;

#[derive(Debug, Clone)]
pub struct MlbClient {
    http: reqwest::Client,
}

impl MlbClient {
    pub fn new() -> Result<Self> {
        let http = reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .timeout(REQUEST_TIMEOUT)
            .connect_timeout(CONNECT_TIMEOUT)
            .gzip(true)
            .build()?;
        Ok(Self { http })
    }

    pub fn inner(&self) -> &reqwest::Client {
        &self.http
    }

    /// GET a URL and deserialize the JSON body.
    ///
    /// Retries on transport errors, 429, and 5xx with exponential backoff. A 4xx other
    /// than 429 is returned immediately — retrying a bad request never helps.
    pub async fn get_json<T: DeserializeOwned>(&self, url: &str) -> Result<T> {
        self.get_json_inner(url, None).await
    }

    /// As `get_json`, with the long timeout. For the few endpoints that return megabytes.
    pub async fn get_json_slow<T: DeserializeOwned>(&self, url: &str) -> Result<T> {
        self.get_json_inner(url, Some(SLOW_REQUEST_TIMEOUT)).await
    }

    async fn get_json_inner<T: DeserializeOwned>(
        &self,
        url: &str,
        timeout: Option<Duration>,
    ) -> Result<T> {
        let body = self.get_text_inner(url, timeout).await?;
        // Deserialize separately from the request so a schema drift produces a parse
        // error naming the URL, not a bare serde message with no context.
        serde_json::from_str::<T>(&body)
            .map_err(|e| Error::Parse(format!("{url}: {e}")))
    }

    /// GET a URL and return the raw body text.
    pub async fn get_text(&self, url: &str) -> Result<String> {
        self.get_text_inner(url, None).await
    }

    async fn get_text_inner(&self, url: &str, timeout: Option<Duration>) -> Result<String> {
        let mut attempt = 0;
        loop {
            attempt += 1;
            let mut request = self.http.get(url);
            // A per-request timeout overrides the client's, and covers reading the body
            // as well as receiving the headers — which is the half that was expiring.
            if let Some(timeout) = timeout {
                request = request.timeout(timeout);
            }
            let outcome = request.send().await;

            match outcome {
                Ok(resp) => {
                    let status = resp.status();
                    if status.is_success() {
                        return Ok(resp.text().await?);
                    }
                    let retryable = status.as_u16() == 429 || status.is_server_error();
                    if retryable && attempt < MAX_ATTEMPTS {
                        backoff(attempt).await;
                        continue;
                    }
                    return Err(Error::ApiStatus {
                        status: status.as_u16(),
                        url: url.to_string(),
                    });
                }
                Err(e) => {
                    if attempt < MAX_ATTEMPTS && (e.is_timeout() || e.is_connect() || e.is_request())
                    {
                        backoff(attempt).await;
                        continue;
                    }
                    return Err(Error::Http(e));
                }
            }
        }
    }
}

impl Default for MlbClient {
    fn default() -> Self {
        Self::new().expect("failed to build the HTTP client")
    }
}

/// 500ms, then 1s. Short enough that a live-feed poll still lands inside its interval.
async fn backoff(attempt: u32) {
    let millis = 500u64 * 2u64.pow(attempt.saturating_sub(1));
    tokio::time::sleep(Duration::from_millis(millis)).await;
}
