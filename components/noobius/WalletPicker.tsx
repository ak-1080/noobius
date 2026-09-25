'use client';
import { useState } from 'react';
import Image from 'next/image';
import { ArrowLeft, ArrowUpRight, LoaderCircle, Wallet } from 'lucide-react';
import type { WalletOption } from '@/lib/wallet-options';

const POPULAR_SOLANA_WALLETS = [
  {
    id: 'metamask',
    name: 'MetaMask',
    url: 'https://metamask.io/download/',
    matches: (name: string) => /metamask/i.test(name),
  },
  {
    id: 'phantom',
    name: 'Phantom',
    url: 'https://phantom.com/download',
    matches: (name: string) => /phantom/i.test(name),
  },
  {
    id: 'solflare',
    name: 'Solflare',
    url: 'https://www.solflare.com/download/',
    matches: (name: string) => /solflare/i.test(name),
  },
  {
    id: 'backpack',
    name: 'Backpack',
    url: 'https://backpack.app/download',
    matches: (name: string) => /backpack/i.test(name),
  },
] as const;
type PopularWallet = (typeof POPULAR_SOLANA_WALLETS)[number];

function WalletIcon({
  wallet,
  option,
}: {
  wallet?: PopularWallet;
  option?: WalletOption;
}) {
  if (wallet?.id === 'metamask')
    return (
      <Image
        src="/assets/wallets/metamask.svg"
        alt=""
        width={42}
        height={42}
        unoptimized
      />
    );
  if (wallet?.id === 'phantom')
    return (
      <Image
        src="/assets/wallets/phantom.svg"
        alt=""
        width={42}
        height={42}
        unoptimized
      />
    );
  if (option?.icon?.startsWith('data:image/'))
    return (
      <Image src={option.icon} alt="" width={42} height={42} unoptimized />
    );
  return (
    <span
      className={`wallet-generic-icon wallet-icon-${wallet?.id ?? 'other'}`}
    >
      {wallet ? wallet.name[0] : <Wallet size={24} />}
    </span>
  );
}

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
  const solanaWallets = wallets.filter(
    (option) => option.ecosystem === 'solana',
  );
  const [selected, setSelected] = useState<PopularWallet | null>(null);
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
  const popular = POPULAR_SOLANA_WALLETS.map((wallet) => ({
    wallet,
    option: solanaWallets.find((option) => wallet.matches(option.name)),
  }));
  const otherWallets = solanaWallets.filter(
    (option) =>
      !POPULAR_SOLANA_WALLETS.some((wallet) => wallet.matches(option.name)),
  );

  return (
    <div className="wallet-picker">
      {selected ? (
        <div className="wallet-install">
          <button className="wallet-back" onClick={() => setSelected(null)}>
            <ArrowLeft size={17} /> All wallets
          </button>
          <div className="wallet-install-icon">
            <WalletIcon wallet={selected} />
          </div>
          <h3>{selected.name}</h3>
          <p>{selected.name} wasn’t found in this browser.</p>
          <p>
            Install it, or open this site in its mobile browser. Then return
            here to connect.
          </p>
          <a
            className="wallet-install-action"
            href={selected.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Get {selected.name} <ArrowUpRight size={17} />
          </a>
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
                  option ? void connect(option) : setSelected(wallet)
                }
              >
                <WalletIcon wallet={wallet} option={option} />
                <strong>{wallet.name}</strong>
                {connecting === option?.id && (
                  <LoaderCircle
                    size={18}
                    className="wallet-spinner"
                    aria-label="Waiting for wallet"
                  />
                )}
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
                    <WalletIcon option={option} />
                    <strong>{option.name}</strong>
                    {connecting === option.id && (
                      <LoaderCircle
                        size={18}
                        className="wallet-spinner"
                        aria-label="Waiting for wallet"
                      />
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
        <output className="wallet-picker-status">
          Open your wallet and approve the sign-in message.
        </output>
      )}
      <div className="wallet-picker-footer">
        <p>Sign in with a message. No purchase or transaction.</p>
        <button disabled={busy || !!connecting} onClick={onBackToGame}>
          {isPractice ? 'Back to game' : 'Play without a wallet'}
        </button>
      </div>
    </div>
  );
}
