import type { Facility } from '@/lib/facility';
import { CLIENT_DEMAND, clientDemandStatus } from '@/lib/client-demand';
import styles from './WorkPanels.module.css';

export default function ClientDemandMeter({
  facility,
  now,
}: {
  facility: Facility;
  now: number;
}) {
  const demand = clientDemandStatus(facility, now);
  if (!demand) return null;
  const minutes =
    demand.nextAt === null
      ? 0
      : Math.max(1, Math.ceil((demand.nextAt - now) / 60000));
  const refresh =
    minutes >= 60
      ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
      : `${minutes}m`;
  return (
    <section className={styles.demand} aria-label="Client demand">
      <div>
        <strong>Client demand</strong>
        <span>Last 24 hours</span>
      </div>
      <div>
        <span>
          <b>{demand.remainingBookings}</b> / {CLIENT_DEMAND.bookings} bookings
          left
        </span>
        <span>
          <b>{demand.remainingCompute.toLocaleString()}</b> Compute available
        </span>
      </div>
      <progress
        aria-label="Client payment allowance remaining"
        max={CLIENT_DEMAND.compute}
        value={demand.remainingCompute}
      />
      <small>
        Shared with all client jobs ·{' '}
        {demand.nextAt === null
          ? 'No unused demand carries over'
          : `More demand in ${refresh}`}
      </small>
      <details>
        <summary>How client demand works</summary>
        <p>
          Start up to {CLIENT_DEMAND.bookings} client jobs for a total of{' '}
          {CLIENT_DEMAND.compute.toLocaleString()} Compute in payments within
          any 24 hours. A booking uses demand when it starts. Collecting later
          keeps your full payment. Recover supplies, build or trade between
          client orders.
        </p>
      </details>
    </section>
  );
}
