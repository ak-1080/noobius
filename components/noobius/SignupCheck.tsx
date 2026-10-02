'use client';
import { useEffect, useRef, useState } from 'react';
import { SIGNUP_ACTION, type SignupChallenge } from '@/lib/signup-protection';

type Turnstile = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}
type PendingCheck = SignupChallenge & {
  complete: (token: string) => void;
  cancel: () => void;
};

export function useSignupCheck() {
  const [pending, setPending] = useState<PendingCheck | null>(null);
  const cancel = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      cancel.current?.();
    },
    [],
  );
  const request = (challenge: SignupChallenge) =>
    new Promise<string>((resolve, reject) => {
      cancel.current?.();
      const finish = () => {
        cancel.current = null;
        setPending(null);
      };
      const abort = () => {
        finish();
        reject(
          new Error('New account check cancelled. Connect again when ready.'),
        );
      };
      cancel.current = abort;
      setPending({
        ...challenge,
        complete: (token) => {
          finish();
          resolve(token);
        },
        cancel: abort,
      });
    });
  return { pending, request };
}

export default function SignupCheck({ check }: { check: PendingCheck }) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let disposed = false,
      widget: string | undefined;
    const script = document.createElement('script');
    const render = () => {
      if (
        disposed ||
        !host.current ||
        !window.turnstile ||
        widget !== undefined
      )
        return;
      try {
        widget = window.turnstile.render(host.current, {
          sitekey: check.siteKey,
          action: SIGNUP_ACTION,
          cData: check.challenge,
          theme: 'dark',
          size: host.current.clientWidth < 300 ? 'compact' : 'flexible',
          'response-field': false,
          callback: (token: string) => {
            if (!disposed) check.complete(token);
          },
          'error-callback': () => {
            if (!disposed)
              setError('The account check could not load. Retry or cancel.');
            return true;
          },
          'expired-callback': () => {
            if (!disposed) setError('The account check expired. Please retry.');
          },
          'timeout-callback': () => {
            if (!disposed)
              setError('The account check timed out. Please retry.');
          },
        });
      } catch {
        setError('The account check could not load. Retry or cancel.');
      }
    };
    // Load only when a new wallet needs checking, never for guest/returning play.
    script.src =
      'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = render;
    script.onerror = () => {
      if (!disposed)
        setError('The account check could not load. Retry or cancel.');
    };
    const timeout = setTimeout(() => {
      if (!disposed && widget === undefined)
        setError('The account check could not load. Retry or cancel.');
    }, 15000);
    if (window.turnstile) render();
    else document.head.appendChild(script);
    return () => {
      disposed = true;
      clearTimeout(timeout);
      script.remove();
      if (widget !== undefined) window.turnstile?.remove(widget);
    };
  }, [check, attempt]);
  return (
    <section className="signup-check" aria-label="New account verification">
      <h3>One quick account check</h3>
      <p>
        This helps stop automated accounts. Then approve the sign-in message in
        your wallet.
      </p>
      <div ref={host} />
      {error && <p role="alert">{error}</p>}
      <div className="signup-check-actions">
        {error && (
          <button
            onClick={() => {
              setError('');
              setAttempt((value) => value + 1);
            }}
          >
            Retry check
          </button>
        )}
        <button onClick={check.cancel}>Cancel sign-in</button>
      </div>
    </section>
  );
}
