'use client';

import { useState } from 'react';
import Link from 'next/link';
import { GUEST_SAVE_KEY } from '@/lib/guest-save';

export default function PracticeReset() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const reset = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const clear = () => {
        // Only this browser's practice save; wallet accounts are stored separately.
        window.localStorage.removeItem(GUEST_SAVE_KEY);
        if (window.localStorage.getItem(GUEST_SAVE_KEY) !== null)
          throw new Error('Save was not cleared');
      };
      if (navigator.locks) await navigator.locks.request(GUEST_SAVE_KEY, clear);
      else clear();
      window.location.replace('/');
    } catch {
      setError('Your browser could not reset the save. Please try again.');
      setBusy(false);
    }
  };
  return (
    <main
      style={{
        minHeight: '100svh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
    >
      <section
        style={{ width: '100%', maxWidth: 440, display: 'grid', gap: 24 }}
      >
        <p style={{ color: '#bfed85', letterSpacing: '0.15em' }}>NOOBIUS</p>
        <h1 style={{ fontSize: 'clamp(32px, 6vw, 48px)', lineHeight: 1.1 }}>
          A fresh shift.
        </h1>
        <p style={{ color: '#b6c9c9', lineHeight: 1.6 }}>
          Start from character creation again. This clears your guest character,
          center, Compute and tutorial progress in this browser.
        </p>
        <p style={{ color: '#b6c9c9' }}>Wallet saves stay separate.</p>
        {error && <p role="alert">{error}</p>}
        <button
          className="primary-action"
          style={{
            padding: '16px 24px',
            borderRadius: 12,
            background: '#bfed85',
            color: '#122022',
            fontWeight: 700,
          }}
          onClick={() => void reset()}
          disabled={busy}
        >
          {busy ? 'Resetting…' : 'Reset guest progress'}
        </button>
        <Link href="/" style={{ textAlign: 'center', color: '#b6c9c9' }}>
          Keep playing
        </Link>
      </section>
    </main>
  );
}
