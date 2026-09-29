import { careerFor, completedContracts } from './contracts.ts';
import { type Facility } from './facility.ts';
// Keep old offers cancellable while the first token release focuses on
// Compute trading. A private test deployment can opt into the legacy market.
export const itemMarketEnabled = (values: Record<string, unknown>) =>
  values.NOOBIUS_ENABLE_ITEM_MARKET === 'true';
export const TRADE_QUALIFICATION =
  'Finish a client job or make your first equipment upgrade to unlock player trading.';
export function canTrade(f: Facility) {
  return (
    completedContracts(careerFor(f)) >= 1 ||
    Object.values(f.commissions?.completed ?? {}).some((n) => n > 0) ||
    f.computeBoost >= 1 ||
    Object.values(f.builds).reduce((total, n) => total + n, 0) >= 2 ||
    f.claims.includes('first-light') ||
    (f.stats.repairs ?? 0) >= 1
  );
}
export type ItemListing = {
  id: string;
  owner: string;
  mine: boolean;
  name: string;
  item: string;
  quantity: number;
  price: number;
  createdAt: number;
  direct: boolean;
};
export type MarketPage = {
  listings: ItemListing[];
  nextCursor: string | null;
  canTrade: boolean;
  qualification: string;
  recipients: { id: string; name: string }[];
};
