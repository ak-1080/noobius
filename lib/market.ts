import { careerFor, completedContracts } from './contracts.ts';
import { type Facility } from './facility.ts';
export const TRADE_QUALIFICATION =
  'Finish a client job or make your first equipment upgrade to unlock player trading.';
export function canTrade(f: Facility) {
  return (
    completedContracts(careerFor(f)) >= 1 ||
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
