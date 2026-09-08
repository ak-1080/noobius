'use client';
import { useState } from 'react';
import { ArrowLeft, ArrowUpRight, LoaderCircle, Wallet } from 'lucide-react';
import {
  WALLET_CATALOG,
  walletBrand,
  type WalletBrand,
  type WalletOption,
} from '@/lib/wallet-options';

export default function WalletPicker({
  wallets,
  busy,
  error,
  isPractice,
  onConnect,
  onBackToGame,
}: {
  wallets: WalletOption[];
  busy: boolean;
  error: string;
  isPractice: boolean;
  onConnect: (option: WalletOption) => Promise<unknown>;
  onBackToGame: () => void;
}) {
  const [selected, setSelected] = useState<WalletBrand | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const connect = async (option: WalletOption) => {
    if (busy || connecting) return;
    setConnecting(option.id);
    try {
      await onConnect(option);
    } finally {
      setConnecting(null);
    }
  };
  const selectedWallet = WALLET_CATALOG.find(
    (wallet) => wallet.id === selected,
  );
  const selectedProvider = wallets.find(
    (option) => walletBrand(option) === selected,
  );
  const used = new Set<string>();
  const popular = WALLET_CATALOG.map((wallet) => {
    const option = wallets.find(
      (provider) => walletBrand(provider) === wallet.id,
    );
    if (option) used.add(option.id);
    return { wallet, option };
  });
  const otherWallets = wallets.filter((option) => !used.has(option.id));

  return (
    <div className="wallet-picker">
      {selectedWallet ? (
        <div className="wallet-install">
          <button
            className="wallet-back"
            onClick={() => setSelected(null)}
            disabled={busy}
          >
            <ArrowLeft size={17} />
            All wallets
          </button>
          <img src={`/assets/wallets/${selectedWallet.id}.svg`} alt="" />
          <h3>{selectedWallet.name}</h3>
          {selectedProvider ? (
            <>
              <p>Your wallet is ready. Continue to sign in.</p>
              <button
                className="wallet-install-action"
                disabled={busy}
                onClick={() => void connect(selectedProvider)}
              >
                {busy ? 'Check your wallet…' : `Connect ${selectedWallet.name}`}
              </button>
            </>
          ) : selectedWallet.id === 'walletconnect' ? (
            <>
              <p>Phone and QR connections are coming soon.</p>
              <p>Choose an installed browser wallet to connect now.</p>
              <button
                className="wallet-install-action"
                onClick={() => setSelected(null)}
              >
                Choose another wallet
              </button>
            </>
          ) : (
            <>
              <p>{selectedWallet.name} wasn’t found in this browser.</p>
              <p>
                Install it, or open this site in your wallet’s browser. Then
                return here to connect.
              </p>
              <a
                className="wallet-install-action"
                href={selectedWallet.url!}
                target="_blank"
                rel="noopener noreferrer"
              >
                Get {selectedWallet.name}
                <ArrowUpRight size={17} />
              </a>
              <button
                className="wallet-retry"
                onClick={() =>
                  window.dispatchEvent(new Event('eip6963:requestProvider'))
                }
              >
                I have it installed · Check again
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          <h3 className="wallet-group-title">Popular</h3>
          <div className="wallet-popular-list">
            {popular.map(({ wallet, option }) => (
              <button
                className="wallet-brand-row"
                key={wallet.id}
                disabled={busy || !!connecting}
                onClick={() =>
                  option ? void connect(option) : setSelected(wallet.id)
                }
              >
                <img src={`/assets/wallets/${wallet.id}.svg`} alt="" />
                <strong>{wallet.name}</strong>
                {connecting === option?.id && (
                  <LoaderCircle
                    size={18}
                    className="wallet-spinner"
                    aria-label="Waiting for wallet"
                  />
                )}
                {option && !connecting && <small>Installed</small>}
              </button>
            ))}
          </div>
          {!!otherWallets.length && (
            <>
              <h3 className="wallet-group-title wallet-other-title">
                Other installed wallets
              </h3>
              <div className="wallet-popular-list">
                {otherWallets.map((option) => (
                  <button
                    className="wallet-brand-row"
                    key={option.id}
                    disabled={busy || !!connecting}
                    onClick={() => void connect(option)}
                  >
                    <span className="wallet-generic-icon">
                      <Wallet size={24} />
                    </span>
                    <strong>{option.name}</strong>
                    {connecting === option.id && (
                      <LoaderCircle size={18} className="wallet-spinner" />
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
      {error && (
        <p className="wallet-picker-error" role="alert">
          {error}
        </p>
      )}
      {connecting && (
        <p className="wallet-picker-status" role="status">
          Open your wallet and approve the sign-in message.
        </p>
      )}
      <div className="wallet-picker-footer">
        <p>
          {isPractice
            ? 'Your wallet loads its own data center. Practice stays on this device.'
            : 'Sign in with a message. No purchase or transaction.'}
        </p>
        <button disabled={busy || !!connecting} onClick={onBackToGame}>
          {isPractice ? 'Back to game' : 'Play without a wallet'}
        </button>
      </div>
    </div>
  );
}
