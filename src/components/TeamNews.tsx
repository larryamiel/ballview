/**
 * Club news, under My Team.
 *
 * The stories come from mlb.com's own RSS feed for the followed club, read in Rust like
 * every other external request (`commands/news.rs` explains why RSS and not the Stats
 * API). Articles open in the system browser rather than in the webview: this app is a
 * play-by-play viewer, not a browser, and an in-app frame of mlb.com would be worse at
 * being mlb.com than the browser already is.
 *
 * The lead story is given the room a lead story earns, and the rest are a list. Every
 * item is a headline, a byline and a time — the feed carries no body text, so a card
 * that pretended otherwise would be padding.
 */

import { useQuery } from '@tanstack/react-query';
import { openUrl } from '@tauri-apps/plugin-opener';
import { ExternalLink, Newspaper, RotateCw } from 'lucide-react';

import * as api from '../lib/api';
import type { NewsItem } from '../lib/types';
import { EmptyState, ErrorState, Skeleton } from './ui/States';

interface Props {
  teamId: number | null;
}

export function TeamNews({ teamId }: Props) {
  const news = useQuery({
    queryKey: ['news', teamId],
    queryFn: () => api.getTeamNews(teamId ?? undefined, 24),
    // A club's feed turns over a few times a day; a minute-by-minute refetch would be
    // asking mlb.com a question whose answer has not changed.
    staleTime: 10 * 60 * 1000,
  });

  const items = news.data ?? [];
  const [lead, ...rest] = items;

  return (
    <section className="news">
      <div className="panel-head">
        <div className="panel-title">
          <h2>
            <Newspaper size={18} aria-hidden="true" /> News
          </h2>
          <p className="muted small">
            {teamId == null
              ? 'League-wide, until a club is followed'
              : 'From the club’s own feed on mlb.com'}
          </p>
        </div>
        <button className="btn" onClick={() => news.refetch()} disabled={news.isFetching}>
          <RotateCw size={14} className={news.isFetching ? 'spinning' : undefined} />
          Refresh
        </button>
      </div>

      {news.isPending && <Skeleton rows={5} height={64} />}
      {news.isError && (
        <ErrorState
          title="Could not load the news"
          error={news.error}
          onRetry={() => news.refetch()}
        />
      )}

      {news.data && items.length === 0 && (
        <EmptyState icon={<Newspaper size={22} />} title="Nothing published yet">
          The club’s feed is empty right now. It fills up around game days.
        </EmptyState>
      )}

      {lead && <LeadStory item={lead} />}

      {rest.length > 0 && (
        <ul className="news-list">
          {rest.map((item) => (
            <li key={item.link}>
              <button className="news-row" onClick={() => openUrl(item.link)}>
                <span className="news-thumb">
                  {item.image && <img src={item.image} alt="" loading="lazy" />}
                </span>
                <span className="news-row-body">
                  <span className="news-headline">{item.title}</span>
                  <span className="muted small">{byline(item)}</span>
                </span>
                <ExternalLink size={14} className="news-out" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LeadStory({ item }: { item: NewsItem }) {
  return (
    <button className="news-lead" onClick={() => openUrl(item.link)}>
      {item.image && <img src={item.image} alt="" />}
      <span className="news-lead-body">
        <span className="news-lead-headline">{item.title}</span>
        {item.summary && <span className="muted news-lead-summary">{item.summary}</span>}
        <span className="muted small">
          {byline(item)} <ExternalLink size={12} aria-hidden="true" />
        </span>
      </span>
    </button>
  );
}

/** "Sonja Chen · 3 hours ago", dropping whichever half the feed did not supply. */
function byline(item: NewsItem): string {
  return [item.author, item.published && timeAgo(item.published)].filter(Boolean).join(' · ');
}

/**
 * A published time as an age.
 *
 * News is read relative to now — "4 hours ago" is what tells you whether this is today's
 * lineup story or last week's — so the absolute date only appears once an article is old
 * enough that its age has stopped meaning anything.
 */
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';

  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;

  const days = Math.round(hours / 24);
  if (days <= 6) return `${days} ${days === 1 ? 'day' : 'days'} ago`;

  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
