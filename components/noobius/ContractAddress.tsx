'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';

// Display-only placeholder. Replace when the actual contract is launched.
const CONTRACT_ADDRESS = '0x7a9c3e5f2b8d4a6c1e0f9b3d5a7c8e2f4b6d1a90';

export default function ContractAddress({ onToken }: { onToken: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState('');
  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(''), 3000);
    return () => clearTimeout(timer);
  }, [status]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(CONTRACT_ADDRESS);
      setStatus('Copied!');
    } catch {
      input.current?.focus();
      input.current?.select();
      setStatus('Selected — copy manually');
    }
  };
  return (
    <div className="contract-address">
      <span className="contract-address-label">
        CA ·{' '}
        <button type="button" onClick={onToken}>
          $NOOBIUS
        </button>
      </span>
      <div className="contract-address-field">
        <input
          ref={input}
          aria-label="Placeholder contract address"
          value={CONTRACT_ADDRESS}
          readOnly
          spellCheck={false}
          onFocus={(event) => event.currentTarget.select()}
        />
        <button
          type="button"
          onClick={copy}
          aria-label="Copy placeholder contract address"
          title="Copy address"
        >
          {status === 'Copied!' ? <Check size={17} /> : <Copy size={17} />}
        </button>
      </div>
      <span className="contract-address-status" role="status">
        {status}
      </span>
    </div>
  );
}
