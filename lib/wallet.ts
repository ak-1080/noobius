import {stringToHex} from 'viem';
export type WalletProvider={request:(args:{method:string;params?:unknown[]})=>Promise<unknown>};
export async function signInWallet<T>(provider:WalletProvider,issue:(address:string,chainId:number)=>Promise<{message:string}>,verify:(signature:string)=>Promise<T>){
 let accounts:string[];
 try{accounts=await provider.request({method:'eth_requestAccounts'}) as string[];}catch(e){if((e as {code?:number}).code===4001)throw new Error('Wallet connection cancelled. You can try again whenever you’re ready.');throw e;}
 const address=accounts[0];if(!address)throw new Error('Unlock your wallet and select an account.');
 const chainId=parseInt(await provider.request({method:'eth_chainId'}) as string,16);
 const {message}=await issue(address,chainId);let signature:unknown;
 try{signature=await provider.request({method:'personal_sign',params:[stringToHex(message),address]});}catch(e){if((e as {code?:number}).code===4001)throw new Error('Login signature cancelled. You can reconnect whenever you’re ready.');throw new Error('Your wallet could not sign the login. Use a standard Ethereum wallet account and try again.');}
 const latest=await provider.request({method:'eth_accounts'}) as string[],latestChain=parseInt(await provider.request({method:'eth_chainId'}) as string,16);
 if(latest[0]?.toLowerCase()!==address.toLowerCase()||latestChain!==chainId)throw new Error('Your wallet changed during login. Connect again.');
 if(typeof signature!=='string')throw new Error('The wallet did not return a valid signature.');
 return {data:await verify(signature),address};
}
