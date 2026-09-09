import { stringToHex } from 'viem';
import { accountKey } from './wallet-identity.ts';
export type WalletProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};
export async function signInWallet<T>(
  provider: WalletProvider,
  issue: (address: string, chainId: number) => Promise<{ message: string }>,
  verify: (signature: string) => Promise<T>,
) {
  let accounts: string[];
  try {
    accounts = (await provider.request({
      method: 'eth_requestAccounts',
    })) as string[];
  } catch (e) {
    if ((e as { code?: number }).code === 4001)
      throw new Error(
        'Wallet connection cancelled. You can try again whenever you’re ready.',
      );
    throw e;
  }
  const address = accounts[0];
  if (!address) throw new Error('Unlock your wallet and select an account.');
  const chainId = parseInt(
    (await provider.request({ method: 'eth_chainId' })) as string,
    16,
  );
  const { message } = await issue(address, chainId);
  let signature: unknown;
  try {
    signature = await provider.request({
      method: 'personal_sign',
      params: [stringToHex(message), address],
    });
  } catch (e) {
    if ((e as { code?: number }).code === 4001)
      throw new Error(
        'Login signature cancelled. You can reconnect whenever you’re ready.',
      );
    throw new Error(
      'Your wallet could not sign the login. Use a standard Ethereum wallet account and try again.',
    );
  }
  const latest = (await provider.request({
      method: 'eth_accounts',
    })) as string[],
    latestChain = parseInt(
      (await provider.request({ method: 'eth_chainId' })) as string,
      16,
    );
  if (
    latest[0]?.toLowerCase() !== address.toLowerCase() ||
    latestChain !== chainId
  )
    throw new Error('Your wallet changed during login. Connect again.');
  if (typeof signature !== 'string')
    throw new Error('The wallet did not return a valid signature.');
  const data = await verify(signature);
  const finalAccounts = (await provider.request({
      method: 'eth_accounts',
    })) as string[],
    finalChain = parseInt(
      (await provider.request({ method: 'eth_chainId' })) as string,
      16,
    );
  if (
    finalAccounts[0]?.toLowerCase() !== address.toLowerCase() ||
    finalChain !== chainId
  )
    throw new Error('Your wallet changed during login. Connect again.');
  return { data, address };
}

export async function signInSolanaWallet<T>(
  provider: WalletProvider,
  issue: (address: string) => Promise<{ message: string }>,
  verify: (signature: string) => Promise<T>,
) {
  let accounts: string[];
  try {
    accounts = (await provider.request({
      method: 'solana_connect',
    })) as string[];
  } catch (error) {
    if ((error as { code?: number }).code === 4001)
      throw new Error('Wallet connection cancelled. You can try again.');
    throw error;
  }
  const address = accounts[0];
  if (!address)
    throw new Error('Unlock your wallet and select a Solana account.');
  accountKey(address, 'solana');
  const { message } = await issue(address);
  let signature: unknown;
  try {
    signature = await provider.request({
      method: 'solana_signMessage',
      params: [message, address],
    });
  } catch (error) {
    if ((error as { code?: number }).code === 4001)
      throw new Error(
        'Login signature cancelled. You can reconnect whenever you’re ready.',
      );
    throw error;
  }
  if (typeof signature !== 'string' || !/^0x[0-9a-fA-F]{128}$/.test(signature))
    throw new Error('The wallet did not return a valid Solana signature.');
  const current = (await provider.request({
    method: 'solana_accounts',
  })) as string[];
  if (current[0] !== address)
    throw new Error('Your wallet changed during login. Connect again.');
  const data = await verify(signature);
  const final = (await provider.request({
    method: 'solana_accounts',
  })) as string[];
  if (final[0] !== address)
    throw new Error('Your wallet changed during login. Connect again.');
  return { data, address };
}
