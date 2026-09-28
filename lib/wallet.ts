import { accountKey } from './wallet-identity.ts';
export type WalletProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};
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
    if (
      /chain id.*(does not match|mismatch)/i.test(
        error instanceof Error ? error.message : '',
      )
    )
      throw new Error(
        message.includes('Chain ID: devnet')
          ? 'This test game uses Solana Devnet. Switch your wallet to Solana Devnet, then try connecting again.'
          : 'Switch your wallet to the requested Solana network, then try connecting again.',
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
