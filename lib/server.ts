import { env } from 'cloudflare:workers';
import { getAddress, isAddress, verifyMessage } from 'viem';
import { createSiweMessage } from 'viem/siwe';
import { activateJob, answerJob, hintJob, newShift, UPGRADES, type Profile, type Shift, type JobType, type Equipment } from './game';
const SITE_ORIGIN='https://noobius-compute-crew.rivd609.chatgpt.site';
const SESSION_COOKIE='noobius_session',CHALLENGE_COOKIE='noobius_challenge';
export class ApiError extends Error { constructor(public status:number,message:string){super(message);} }
export const db=()=>{if(!env.DB)throw new ApiError(503,'The facility is temporarily offline. Please try again.');return env.DB;};
const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(n=>n.toString(16).padStart(2,'0')).join('');
const token=()=>crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
function cookieValue(request:Request,name:string){return request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1);}
function cookie(request:Request,name:string,value:string,age:number){return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${new URL(request.url).protocol==='https:'||request.headers.get('origin')===SITE_ORIGIN?'; Secure':''}`;}
function origin(request:Request){const incoming=request.headers.get('origin');if(!incoming||![new URL(request.url).origin,SITE_ORIGIN].includes(incoming))throw new ApiError(403,'This request did not originate from the facility.');return incoming;}
async function bodyOf(request:Request){origin(request);if(!request.headers.get('content-type')?.startsWith('application/json'))throw new ApiError(415,'Send JSON to this endpoint.');if(Number(request.headers.get('content-length')??0)>12000)throw new ApiError(413,'Request too large.');const raw=await request.text();if(raw.length>12000)throw new ApiError(413,'Request too large.');try{return JSON.parse(raw) as Record<string,unknown>;}catch{throw new ApiError(400,'Invalid request.');}}
async function rate(request:Request,action:string,limit=120){const now=Date.now(),key=await hash(`${request.headers.get('cf-connecting-ip')??'local'}:${action}:${Math.floor(now/60000)}`);const row=await db().prepare('INSERT INTO rate_limits (key,count,resets_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key,now+120000).first<{count:number}>();if((row?.count??0)>limit)throw new ApiError(429,'A little too fast. Please try again in a minute.');if(Math.random()<.02)await db().batch([db().prepare('DELETE FROM rate_limits WHERE resets_at < ?').bind(now),db().prepare('DELETE FROM challenges WHERE expires_at < ?').bind(now),db().prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now)]);}
type PlayerRow={wallet:string;name:string;credits:number;xp:number;shifts:number;best_score:number;scanner:number;visor:number;tracer:number};
async function player(wallet:string):Promise<Profile>{const p=await db().prepare('SELECT * FROM players WHERE wallet=?').bind(wallet).first<PlayerRow>();if(!p)throw new ApiError(401,'Please reconnect your wallet.');return {wallet:p.wallet,name:p.name,credits:p.credits,xp:p.xp,shifts:p.shifts,bestScore:p.best_score,equipment:{scanner:!!p.scanner,visor:!!p.visor,tracer:!!p.tracer}};}
async function identity(request:Request){const t=cookieValue(request,SESSION_COOKIE);if(!t||!/^[a-f0-9]{64}$/.test(t))return null;const s=await db().prepare('SELECT wallet FROM sessions WHERE token_hash=? AND expires_at>?').bind(await hash(t),Date.now()).first<{wallet:string}>();return s?.wallet??null;}
async function getRun(wallet:string,id?:string){const row=id?await db().prepare('SELECT state FROM shifts WHERE wallet=? AND id=?').bind(wallet,id).first<{state:string}>():await db().prepare('SELECT state FROM shifts WHERE wallet=? ORDER BY started_at DESC LIMIT 1').bind(wallet).first<{state:string}>();return row?JSON.parse(row.state) as Shift:null;}
function result(data:unknown,status=200,headers?:HeadersInit){return Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});}
async function responseFor(wallet:string,shift?:Shift|null){return {profile:await player(wallet),shift:shift===undefined?await getRun(wallet):shift};}
async function saveRun(wallet:string,previous:Shift,next:Shift){const mutation=token(),deltaCredits=next.credits-previous.credits,deltaXp=next.xp-previous.xp,finished=!previous.completedAt&&!!next.completedAt;const results=await db().batch([
 db().prepare('UPDATE shifts SET state=?,version=?,mutation=?,completed_at=? WHERE id=? AND wallet=? AND version=?').bind(JSON.stringify(next),next.version,mutation,next.completedAt,next.id,wallet,previous.version),
 db().prepare('UPDATE players SET credits=credits+?,xp=xp+?,shifts=shifts+?,best_score=MAX(best_score,?) WHERE wallet=? AND EXISTS(SELECT 1 FROM shifts WHERE id=? AND mutation=?)').bind(deltaCredits,deltaXp,finished?1:0,finished?next.score:0,wallet,next.id,mutation),
]);if(results[0].meta.changes!==1)throw new ApiError(409,'Your shift changed in another tab. Please retry.');return next;}
export async function handleGame(request:Request,action:string){
 if(request.method==='GET'){
  if(action==='leaderboard'){const rows=await db().prepare('SELECT name,best_score AS score,shifts,xp FROM players WHERE shifts>0 ORDER BY best_score DESC,created_at ASC LIMIT 20').all();return result({entries:rows.results});}
  if(action==='profile'){const wallet=await identity(request);return result(wallet?await responseFor(wallet):{profile:null,shift:null});}
  throw new ApiError(404,'Unknown endpoint.');
 }
 const body=await bodyOf(request);
 await rate(request,action==='nonce'||action==='verify'?'auth':'game',action==='nonce'||action==='verify'?20:120);
 if(action==='nonce'){
  if(typeof body.address!=='string'||!isAddress(body.address)||!Number.isSafeInteger(body.chainId)||Number(body.chainId)<1)throw new ApiError(400,'Select an Ethereum-compatible wallet account.');
  const wallet=getAddress(body.address),secret=token(),now=Date.now(),siteOrigin=origin(request);
  const message=createSiweMessage({address:wallet,chainId:Number(body.chainId),domain:new URL(siteOrigin).host,uri:siteOrigin,version:'1',nonce:token(),issuedAt:new Date(now),expirationTime:new Date(now+300000),statement:'Sign in to Noobius to save your game progress. This does not authorize transactions or token spending.'});
  const old=cookieValue(request,CHALLENGE_COOKIE);if(old)await db().prepare('DELETE FROM challenges WHERE token_hash=?').bind(await hash(old)).run();
  await db().prepare('INSERT INTO challenges (token_hash,wallet,message,expires_at) VALUES (?,?,?,?)').bind(await hash(secret),wallet.toLowerCase(),message,now+300000).run();
  return result({message},200,{'Set-Cookie':cookie(request,CHALLENGE_COOKIE,secret,300)});
 }
 if(action==='verify'){
  const secret=cookieValue(request,CHALLENGE_COOKIE);if(!secret||typeof body.signature!=='string'||!/^0x[a-fA-F0-9]{130}$/.test(body.signature))throw new ApiError(401,'The login expired or the wallet signature is unsupported. Connect again using a standard wallet account.');
  const tokenHash=await hash(secret),challenge=await db().prepare('SELECT wallet,message FROM challenges WHERE token_hash=? AND expires_at>?').bind(tokenHash,Date.now()).first<{wallet:`0x${string}`;message:string}>();
  if(!challenge)throw new ApiError(401,'Your login message expired. Please connect again.');
  const expectedDomain=new URL(origin(request)).host;
  if(!challenge.message.startsWith(expectedDomain+' wants you to sign in'))throw new ApiError(401,'This login belongs to another site.');
  let valid=false;try{valid=await verifyMessage({address:challenge.wallet,message:challenge.message,signature:body.signature as `0x${string}`});}catch{/* invalid signature */}
  if(!valid)throw new ApiError(401,'The signature does not match this wallet. Please try again.');
  const consumed=await db().prepare('DELETE FROM challenges WHERE token_hash=? AND expires_at>? RETURNING wallet').bind(tokenHash,Date.now()).first<{wallet:string}>();if(!consumed)throw new ApiError(401,'This login message was already used. Connect again.');
  const session=token(),now=Date.now();await db().batch([db().prepare('INSERT OR IGNORE INTO players (wallet,name,created_at) VALUES (?,?,?)').bind(challenge.wallet,'Noob '+challenge.wallet.slice(-5).toUpperCase(),now),db().prepare('INSERT INTO sessions (token_hash,wallet,expires_at) VALUES (?,?,?)').bind(await hash(session),challenge.wallet,now+7*86400000)]);
  const headers=new Headers({'Cache-Control':'no-store'});headers.append('Set-Cookie',cookie(request,SESSION_COOKIE,session,604800));headers.append('Set-Cookie',cookie(request,CHALLENGE_COOKIE,'',0));return Response.json(await responseFor(challenge.wallet),{headers});
 }
 if(action==='logout'){const current=await identity(request);if(current&&body.expectedWallet!==current)throw new ApiError(401,'Your wallet session changed in another tab. Reconnect before continuing.');const secret=cookieValue(request,SESSION_COOKIE);if(secret)await db().prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hash(secret)).run();return result({ok:true},200,{'Set-Cookie':cookie(request,SESSION_COOKIE,'',0)});}
 const wallet=await identity(request);if(!wallet)throw new ApiError(401,'Your shift session ended. Reconnect your wallet to continue.');
 if(body.expectedWallet!==wallet)throw new ApiError(401,'Your wallet session changed in another tab. Reconnect before continuing.');
 if(action==='name'){
  if(typeof body.name!=='string'||!/^[A-Za-z0-9 _-]{2,20}$/.test(body.name.trim()))throw new ApiError(400,'Use 2–20 letters, numbers, spaces, dashes, or underscores.');
  await db().prepare('UPDATE players SET name=? WHERE wallet=?').bind(body.name.trim(),wallet).run();return result(await responseFor(wallet));
 }
 if(action==='start'){
  const current=await getRun(wallet);if(current&&!current.completedAt&&Date.now()-current.startedAt<86400000)return result(await responseFor(wallet,current));
  if(current&&!current.completedAt){const closed={...current,completedAt:Date.now(),version:current.version+1};await db().prepare('UPDATE shifts SET completed_at=?,state=?,version=? WHERE id=? AND wallet=? AND version=?').bind(closed.completedAt,JSON.stringify(closed),closed.version,current.id,wallet,current.version).run();}
  const p=await player(wallet),next=newShift(p.equipment);await db().prepare('INSERT OR IGNORE INTO shifts (id,wallet,state,version,mutation,started_at) VALUES (?,?,?,0,?,?)').bind(next.id,wallet,JSON.stringify(next),token(),next.startedAt).run();return result(await responseFor(wallet));
 }
 if(action==='upgrade'){
  const upgrade=UPGRADES.find(u=>u.id===body.upgrade);if(!upgrade)throw new ApiError(400,'Unknown equipment.');
  // The column identifier comes exclusively from the fixed server-side catalog.
  const changed=await db().prepare(`UPDATE players SET credits=credits-?,${upgrade.id}=1 WHERE wallet=? AND credits>=? AND ${upgrade.id}=0`).bind(upgrade.price,wallet,upgrade.price).run();
  if(changed.meta.changes!==1)throw new ApiError(409,'This equipment is already owned, or you need more credits.');return result(await responseFor(wallet));
 }
 if(['activate','answer','hint'].includes(action)){
  if(typeof body.shiftId!=='string'||typeof body.job!=='string'||!['cooling','boot','network'].includes(body.job))throw new ApiError(400,'Choose a valid station.');
  const previous=await getRun(wallet,body.shiftId);if(!previous)throw new ApiError(404,'This shift does not belong to your wallet.');
  let next:Shift;let correct:boolean|undefined;
  if(action==='activate'){next=activateJob(previous,body.job as JobType);if(next.version===previous.version)return result(await responseFor(wallet,next));}
  else if(action==='hint')next=hintJob(previous,body.job as JobType);
  else {if(typeof body.requestId!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(body.requestId))throw new ApiError(400,'Missing repair request identifier.');const attempt=answerJob(previous,body.job as JobType,body.answer,body.requestId);next=attempt.shift;correct=attempt.correct;if(attempt.duplicate)return result({...await responseFor(wallet,next),correct,duplicate:true});}
  await saveRun(wallet,previous,next);return result({...await responseFor(wallet,next),correct,initialReveal:action==='activate'&&previous.jobs.find(j=>j.id===body.job)?.status==='pending'});
 }
 throw new ApiError(404,'Unknown endpoint.');
}
