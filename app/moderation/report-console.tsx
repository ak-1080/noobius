'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, ShieldCheck } from 'lucide-react';
import type {
  ModerationReport,
  ReportDecision,
  ReportQueue,
  ReportStatus,
} from '@/lib/moderation';
import styles from './moderation.module.css';

const titles: Record<ReportStatus, string> = {
  open: 'Needs review',
  dismissed: 'Dismissed',
  removed: 'Removed',
};
const date = (time: number) => new Date(time).toLocaleString();

async function readResponse<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(data.error ?? 'Could not load reports. Please retry.');
  return data;
}
function boundedRequest(controller: AbortController) {
  return AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]);
}

export default function ReportConsole() {
  const [status, setStatus] = useState<ReportStatus>('open');
  const [cursor, setCursor] = useState('');
  const [page, setPage] = useState<ReportQueue | null>(null);
  const [wallet, setWallet] = useState('');
  const [selected, setSelected] = useState<ModerationReport | null>(null);
  const [decision, setDecision] = useState<ReportDecision>('dismissed');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const [requests] = useState(() => new Set<AbortController>());
  const clear = useCallback(() => {
    requests.forEach((request) => request.abort());
    requests.clear();
    setPage(null);
    setSelected(null);
    setWallet('');
    setNote('');
    setError('');
    setSaving(false);
    setLoading(true);
  }, [requests]);
  const refresh = useCallback(() => {
    clear();
    setRevision((n) => n + 1);
  }, [clear]);

  useEffect(() => {
    const controller = new AbortController();
    requests.add(controller);
    const options = {
      signal: boundedRequest(controller),
      cache: 'no-store' as const,
    };
    Promise.all([
      fetch('/api/noobius/profile', options).then(
        readResponse<{ profile: { wallet: string; publicId: string } | null }>,
      ),
      fetch(
        `/api/noobius/moderation-reports?status=${status}&cursor=${encodeURIComponent(cursor)}`,
        options,
      ).then(readResponse<ReportQueue>),
    ])
      .then(([profile, queue]) => {
        if (controller.signal.aborted) return;
        if (!profile.profile || profile.profile.publicId !== queue.operatorId)
          throw new Error(
            'Your account changed. Refresh the queue to continue.',
          );
        setWallet(profile.profile.wallet);
        setPage(queue);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted)
          setError(
            err instanceof Error && err.name === 'TimeoutError'
              ? 'Loading timed out. Refresh to try again.'
              : err instanceof Error
                ? err.message
                : 'Could not load reports. Please retry.',
          );
      })
      .finally(() => {
        requests.delete(controller);
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      requests.delete(controller);
    };
  }, [status, cursor, revision, requests]);

  useEffect(() => {
    const visibility = () => {
      if (document.hidden) {
        clear();
        setNotice('');
      } else refresh();
    };
    const focus = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('focus', focus);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('focus', focus);
      requests.forEach((request) => request.abort());
      requests.clear();
    };
  }, [clear, refresh, requests]);

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !wallet || saving) return;
    const controller = new AbortController();
    requests.add(controller);
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/noobius/moderation-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: boundedRequest(controller),
        body: JSON.stringify({
          expectedWallet: wallet,
          id: selected.id,
          decision,
          note,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        message?: string;
      };
      if (controller.signal.aborted) return;
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setPage(null);
          setSelected(null);
          setWallet('');
          setNote('');
        }
        if (response.status === 409) {
          setNotice(
            data.error ?? 'This report changed. The queue has been refreshed.',
          );
          refresh();
          return;
        }
        throw new Error(
          data.error ?? 'The review could not be saved. Please retry.',
        );
      }
      setNotice(data.message ?? 'Review saved.');
      refresh();
    } catch (err) {
      if (!controller.signal.aborted)
        setError(
          err instanceof Error && err.name === 'TimeoutError'
            ? 'The review request timed out. Refresh the queue and check history before retrying; it may have been saved.'
            : err instanceof Error
              ? err.message
              : 'The review could not be saved. Please retry.',
        );
    } finally {
      requests.delete(controller);
      if (!controller.signal.aborted) setSaving(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className="wordmark" href="/" aria-label="Noobius home">
          noobius<span>•</span>
        </Link>
        <Link href="/">
          <ArrowLeft size={16} /> Back to game
        </Link>
      </header>
      <div className={styles.heading}>
        <ShieldCheck size={28} />
        <div>
          <h1>Report review</h1>
          <p>Review player reports and keep neighborhood chat welcoming.</p>
        </div>
      </div>
      <div className={styles.toolbar}>
        <fieldset aria-label="Report status" className={styles.filters}>
          {(['open', 'dismissed', 'removed'] as const).map((filter) => (
            <button
              key={filter}
              disabled={saving}
              aria-pressed={status === filter}
              onClick={() => {
                setCursor('');
                setStatus(filter);
                setNotice('');
                refresh();
              }}
            >
              {titles[filter]}
            </button>
          ))}
        </fieldset>
        <button disabled={saving || loading} onClick={refresh}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>
      {notice && <output className={styles.notice}>{notice}</output>}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <output>Checking report access…</output>
      ) : !page ? (
        <section className={styles.empty}>
          <h2>Moderator access required</h2>
          <p>
            Connect an authorized wallet in the game, then return here. Player
            ranks do not grant access to reports.
          </p>
          <Link href="/">
            Open the game <ArrowLeft size={16} className={styles.arrow} />
          </Link>
        </section>
      ) : (
        <>
          {page.reports.length === 0 ? (
            <p className={styles.empty}>No reports on this page.</p>
          ) : (
            <div className={styles.layout}>
              <div className={styles.list} aria-label="Reports">
                {page.reports.map((report) => (
                  <button
                    className={styles.report}
                    key={report.id}
                    aria-pressed={selected?.id === report.id}
                    disabled={saving}
                    onClick={() => {
                      setSelected(report);
                      setNote('');
                      setDecision('dismissed');
                      setError('');
                    }}
                  >
                    <span className={styles.reason}>{report.reason}</span>
                    <strong>{report.authorName}</strong>
                    <span className={styles.excerpt}>{report.message}</span>
                    <time dateTime={new Date(report.createdAt).toISOString()}>
                      {date(report.createdAt)}
                    </time>
                  </button>
                ))}
              </div>
              <section className={styles.detail} aria-label="Report detail">
                {selected ? (
                  <>
                    <span className={styles.reason}>
                      {titles[selected.status]}
                    </span>
                    <h2>{selected.reason}</h2>
                    <p>Reported {date(selected.createdAt)}</p>
                    <blockquote>{selected.message}</blockquote>
                    <dl>
                      <dt>Message author · current name</dt>
                      <dd>
                        {selected.authorName}
                        <code>{selected.author}</code>
                      </dd>
                      <dt>Reported by · current name</dt>
                      <dd>
                        {selected.reporterName}
                        <code>{selected.reporter}</code>
                      </dd>
                    </dl>
                    {selected.status === 'open' ? (
                      <form onSubmit={submit}>
                        <label htmlFor="review-decision">Decision</label>
                        <select
                          id="review-decision"
                          value={decision}
                          disabled={saving}
                          onChange={(event) =>
                            setDecision(event.target.value as ReportDecision)
                          }
                        >
                          <option value="dismissed">
                            Dismiss report — leave message
                          </option>
                          <option value="removed">
                            Remove message from chat
                          </option>
                        </select>
                        <label htmlFor="review-note">Review note</label>
                        <textarea
                          id="review-note"
                          value={note}
                          disabled={saving}
                          onChange={(event) => setNote(event.target.value)}
                          minLength={3}
                          maxLength={500}
                          required
                          rows={4}
                          placeholder="Explain your decision for other moderators."
                        />
                        <p>
                          The message snapshot and your decision will remain in
                          review history. This does not restrict the player’s
                          account.
                        </p>
                        <button
                          className={styles.submit}
                          disabled={saving || note.trim().length < 3}
                          type="submit"
                        >
                          {saving
                            ? 'Saving review…'
                            : decision === 'removed'
                              ? 'Remove message'
                              : 'Dismiss report'}
                        </button>
                      </form>
                    ) : (
                      <div className={styles.history}>
                        <h3>Review decision</h3>
                        <p>
                          {selected.reviewNote ??
                            'No review note was recorded.'}
                        </p>
                        {selected.reviewedAt && (
                          <p>{date(selected.reviewedAt)}</p>
                        )}
                        <code>{selected.reviewedBy}</code>
                      </div>
                    )}
                  </>
                ) : (
                  <p>Select a report to read its message and review history.</p>
                )}
              </section>
            </div>
          )}
          <nav className={styles.pagination} aria-label="Report pages">
            {cursor && (
              <button
                disabled={saving}
                onClick={() => {
                  setCursor('');
                  refresh();
                }}
              >
                First page
              </button>
            )}
            {page.nextCursor && (
              <button
                disabled={saving}
                onClick={() => {
                  setCursor(page.nextCursor!);
                  refresh();
                }}
              >
                Older reports →
              </button>
            )}
          </nav>
        </>
      )}
    </main>
  );
}
