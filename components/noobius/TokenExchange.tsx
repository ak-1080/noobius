'use client';
import { shortWalletAddress } from '@/lib/wallet-identity';
import { useState } from 'react';
import { ArrowDown, ArrowRight, Check, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ComputeIcon from './ComputeIcon';

export default function TokenExchange({
  balance,
  wallet,
  onConnect,
}: {
  balance: number;
  wallet?: string;
  onConnect: () => void;
}) {
  const [amount, setAmount] = useState(''),
    [review, setReview] = useState(false);
  const value = Number(amount),
    valid = Number.isSafeInteger(value) && value > 0 && value <= balance;
  const connected = !!wallet && wallet !== 'practice';
  return (
    <div className="token-exchange">
      <div className="exchange-heading">
        <h2>Request $NOOBIUS</h2>
        <span>Preview</span>
      </div>
      <div className="exchange-from">
        <label htmlFor="exchange-amount">You use</label>
        <div>
          <ComputeIcon size={42} />
          <input
            id="exchange-amount"
            type="number"
            inputMode="numeric"
            min={1}
            max={balance}
            step={1}
            aria-invalid={amount !== '' && !valid}
            aria-describedby="exchange-balance exchange-error"
            placeholder="0"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setReview(false);
            }}
          />
          <strong>Compute</strong>
        </div>
        <small id="exchange-balance">
          Balance: {balance.toLocaleString()}{' '}
          <button
            onClick={() => {
              setAmount(String(balance));
              setReview(false);
            }}
          >
            Max
          </button>
        </small>
        <p id="exchange-error" className="exchange-error" role="status">
          {amount !== '' && !valid
            ? balance > 0
              ? `Choose a whole amount from 1 to ${balance.toLocaleString()} Compute.`
              : 'Collect some Compute in your data center first.'
            : ''}
        </p>
      </div>
      <ArrowDown className="exchange-arrow" size={24} />
      <div className="exchange-to">
        <span>You receive</span>
        <strong>$NOOBIUS</strong>
        <small>A live quote will appear when the exchange is connected.</small>
      </div>
      <div className="exchange-wallet">
        <Wallet size={18} />
        <span>
          {connected ? shortWalletAddress(wallet) : 'Choose your wallet'}
        </span>
        {!connected && <button onClick={onConnect}>Connect</button>}
      </div>
      <Button
        className="primary-action"
        disabled={!valid}
        onClick={() => setReview(true)}
      >
        Preview request <ArrowRight size={18} />
      </Button>
      {review && (
        <div className="exchange-review" role="status">
          <Check size={23} />
          <div>
            <strong>{value.toLocaleString()} Compute selected</strong>
            <p>Preview only. Nothing spent or sent.</p>
          </div>
        </div>
      )}
      <p className="exchange-status">
        Transfers aren’t connected yet. Your Compute stays available to play.
      </p>
    </div>
  );
}
