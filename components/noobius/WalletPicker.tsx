'use client';
import { useState } from 'react';
import Image from 'next/image';
import { ArrowLeft, ArrowUpRight, LoaderCircle } from 'lucide-react';
import SignupCheck from './SignupCheck';
import type { ComponentProps } from 'react';
import {
  WALLET_CATALOG,
  supportedWalletOptions,
  walletBrand,
  type WalletOption,
} from '@/lib/wallet-options';

type PopularWallet = (typeof WALLET_CATALOG)[number];

function WalletIcon({ wallet }: { wallet: PopularWallet }) {
  return (
    <Image
      src={`/assets/wallets/${wallet.id}.${wallet.id === 'backpack' ? 'png' : 'svg'}`}
      alt=""
      width={42}
      height={42}
      unoptimized
    />
  );
}

export default function WalletPicker({
  wallets,
  busy,
  error,
  isPractice,
  signupCheck,
  onConnect,
  onBackToGame,
}: {
  wallets: WalletOption[];
  busy: boolean;
  error: string;
  isPractice: boolean;
  signupCheck?: ComponentProps<typeof SignupCheck>['check'] | null;
  onConnect: (option: WalletOption) => Promise<unknown>;
  onBackToGame: () => void;
}) {
  const solanaWallets = supportedWalletOptions(wallets);
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
  const popular = WALLET_CATALOG.map((wallet) => ({
    wallet,
    option: solanaWallets.find(
      (option) => walletBrand(option.name) === wallet.id,
    ),
  }));
  if (signupCheck) return <SignupCheck check={signupCheck} />;
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
                <WalletIcon wallet={wallet} />
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
