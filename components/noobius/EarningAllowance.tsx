import type { EarningAllowance as Allowance } from '@/lib/earning-policy';
import styles from './WorkPanels.module.css';

export default function EarningAllowance({
  allowance,
}: {
  allowance: Allowance;
}) {
  return (
    <details className={styles.demand} aria-label="Earning allowance">
      <summary>
        Last 24 hours · {allowance.compute.toLocaleString()} Compute allowance
        left
      </summary>
      <p>
        New payments share a 6,000 Compute budget. Client jobs have their own
        12-booking / 4,000 Compute limit inside it. Booked work keeps its full
        reward; collecting later does not reserve it again.
      </p>
      <div>
        <span>
          <b>{allowance.materials}</b> / 600 recovery points left
        </span>
        <span>
          <b>{allowance.shifts}</b> / 4 repair shifts left
        </span>
      </div>
      <p>
        Scrap uses 1 recovery point, wire and coolant 2, chips and fiber 3;
        equipment uses its shop resale value. Recovery is reserved when work
        begins. Purchases, crafting and player transfers use no recovery points.
      </p>
      <small>
        {allowance.shared
          ? 'Linked wallets share these allowances. '
          : 'Wallets first linked in one browser share these allowances. '}
        Earlier work leaves the window after 24 hours. Stored items, earned
        balances and player trades stay available.
      </small>
    </details>
  );
}
