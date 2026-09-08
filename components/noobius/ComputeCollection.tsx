'use client';
import { ArrowDownToLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  computePerTick,
  computeTankCapacity,
  storedComputeNow,
  type Facility,
  type FacilityAction,
} from '@/lib/facility';
import ComputeIcon from './ComputeIcon';

// Build and the bonus desk share one view of automatic production. Collecting
// only moves earned output into the balance; it never buys an upgrade.
export default function ComputeCollection({
  facility,
  now,
  busy,
  onAction,
}: {
  facility: Facility;
  now: number;
  busy: boolean;
  onAction: (action: Omit<FacilityAction, 'requestId'>) => Promise<unknown>;
}) {
  const ready = storedComputeNow(facility, now);
  const capacity = computeTankCapacity(facility);
  const perTick = computePerTick(facility);
  const elapsed = Math.max(0, now - facility.computeAt) % 15000;
  const seconds = Math.max(1, Math.ceil((15000 - elapsed) / 1000));
  const full = ready >= capacity;
  if (!perTick) return null;

  return (
    <section
      className={`collection-strip ${ready ? 'has-compute' : ''}`}
      aria-label="Machine earnings"
    >
      <div className="collection-summary">
        <ComputeIcon size={34} />
        <div>
          <strong>{ready.toLocaleString()} Compute ready</strong>
          <span>Your machines earn {perTick * 4}/min.</span>
        </div>
        <Button
          className="primary-action"
          disabled={busy || ready < 1}
          onClick={() => void onAction({ type: 'compute-harvest' })}
        >
          <ArrowDownToLine size={18} /> Collect
        </Button>
      </div>
      <div className="collection-timing">
        <span>
          {full
            ? 'Storage full. Collect to keep earning.'
            : `Next +${Math.min(perTick, capacity - ready)} in ${seconds}s`}
        </span>
        <small>
          {full ? '1 hour stored' : 'Keeps earning while you build'}
        </small>
      </div>
      <div className="collection-tick" aria-hidden="true">
        <i style={{ width: `${full ? 100 : (elapsed / 15000) * 100}%` }} />
      </div>
    </section>
  );
}
