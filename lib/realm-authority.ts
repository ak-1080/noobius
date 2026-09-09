// This context is built by the server, never from request JSON. The SQL check
// runs at the write as well as before it, so a concurrent revocation wins.
export type RealmPermit = { policy: string | null; localTest: boolean };
const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";
export function localRealmTest(
  values: Record<string, unknown>,
  url: string,
  development: boolean,
) {
  return (
    development &&
    values.NOOBIUS_LOCAL_REALM_TEST === 'true' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)
  );
}
export function holdingGuard(walletSql: string, permit?: RealmPermit) {
  if (permit?.localTest) return '1';
  if (!permit?.policy) return '0';
  const clock = "(CAST(strftime('%s','now') AS INTEGER)*1000)";
  return `EXISTS(SELECT 1 FROM realm_entitlements entitlement WHERE entitlement.wallet=${walletSql}
    AND length(entitlement.wallet)=42 AND substr(entitlement.wallet,1,2)='0x'
    AND substr(entitlement.wallet,3) NOT GLOB '*[^0-9a-fA-F]*'
    AND entitlement.policy=${quote(permit.policy)} AND (
      (entitlement.status='eligible' AND entitlement.next_check_at>${clock}) OR
      (entitlement.status='unavailable' AND entitlement.grace_until>${clock})))`;
}
export function realmWriteGuard(alias: string, permit?: RealmPermit) {
  if (!/^[a-z_]+$/.test(alias)) throw new Error('Invalid authority alias');
  return `EXISTS(SELECT 1 FROM neighborhoods realm WHERE realm.id=${alias}.neighborhood_id AND
    (realm.realm='commons' OR (realm.realm='gpu' AND ${holdingGuard(alias + '.wallet', permit)})))`;
}
export const walletHoldingGuard = (wallet: string, permit?: RealmPermit) =>
  holdingGuard(quote(wallet), permit);
