use anyhow::{bail, Context, Result};
use chrono::NaiveDate;
use serde::Deserialize;
use std::time::Duration;

const RANKINGS: &[&str] = &[
    "best-100",
    "top-installs",
    "trending-7d",
    "social-buzz",
    "most-active",
    "official-100",
    "official-vendors",
    "top-repos",
    "rising-stars",
];

fn is_date(value: &str) -> bool {
    value.len() == 10
        && NaiveDate::parse_from_str(value, "%Y-%m-%d")
            .is_ok_and(|date| date.format("%Y-%m-%d").to_string() == value)
}

fn ranking_url(ranking: &str, date: &str) -> Result<String> {
    if !RANKINGS.contains(&ranking) || (date != "latest" && !is_date(date)) {
        bail!("Invalid ranking or data date");
    }
    Ok(format!(
        "https://raw.githubusercontent.com/LinklyAI/best-skills/main/data/{date}/rankings/{ranking}.csv"
    ))
}

async fn fetch(url: &str) -> Result<Option<String>> {
    let mut response = crate::proxy::http_client::get()
        .get(url)
        .header(reqwest::header::USER_AGENT, "cc-switch")
        .header(reqwest::header::CACHE_CONTROL, "no-cache")
        .timeout(Duration::from_secs(20))
        .send()
        .await?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    response = response.error_for_status()?;
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await? {
        if bytes.len() + chunk.len() > 2 * 1024 * 1024 {
            bail!("Ranking response is too large");
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(Some(String::from_utf8(bytes)?))
}

pub async fn ranking(ranking: &str, date: &str) -> Result<Option<String>> {
    fetch(&ranking_url(ranking, date)?).await
}

pub async fn dates() -> Result<Vec<String>> {
    #[derive(Deserialize)]
    struct Entry {
        name: String,
        #[serde(rename = "type")]
        kind: String,
    }
    let text = fetch("https://api.github.com/repos/LinklyAI/best-skills/contents/data?ref=main")
        .await?
        .context("Ranking history directory was not found")?;
    let entries: Vec<Entry> = serde_json::from_str(&text)?;
    let mut dates: Vec<_> = entries
        .into_iter()
        .filter(|entry| entry.kind == "dir" && is_date(&entry.name))
        .map(|entry| entry.name)
        .collect();
    dates.sort_unstable_by(|a, b| b.cmp(a));
    Ok(dates)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_known_rankings_and_valid_snapshot_dates_are_requested() {
        for board in RANKINGS {
            assert!(ranking_url(board, "latest").is_ok());
            assert!(ranking_url(board, "2026-10-14").is_ok());
        }
        for date in ["../raw", "2026-02-30", "2026-1-01", "2026-10-14/../latest"] {
            assert!(ranking_url("best-100", date).is_err());
        }
        assert!(ranking_url("../raw/buzz", "latest").is_err());
    }
}
