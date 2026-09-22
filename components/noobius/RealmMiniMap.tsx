'use client';
import { realmWorld } from '@/lib/realm-worlds';
import { realmFor, type RealmId } from '@/lib/realm-catalog';
export default function RealmMiniMap({
  realm,
  position,
  onSelect,
}: {
  realm: RealmId;
  position: { x: number; z: number };
  onSelect: (id: string) => void;
}) {
  const world = realmWorld(realm),
    color = realmFor(realm).color;
  return (
    <nav className="realm-mini-map" aria-label="Realm stations">
      <span>DISTRICT MAP</span>
      <svg
        viewBox="-36 -43 72 68"
        aria-label={`${realmFor(realm).name}. Your position is the white dot.`}
      >
        {world.floors.map((r, i) => (
          <rect
            key={i}
            x={r.x - r.w / 2}
            y={r.z - r.d / 2}
            width={r.w}
            height={r.d}
            fill="#244249"
            stroke="#648086"
            strokeWidth=".25"
          />
        ))}
        {world.sites.map((s) => (
          <g key={s.id}>
            <circle cx={s.x} cy={s.z} r={2.7} fill={color} />
            <text
              x={s.x}
              y={s.z + 1}
              textAnchor="middle"
              fontSize={3.4}
              fontWeight="bold"
              fill="#142327"
            >
              {s.index + 1}
            </text>
          </g>
        ))}
        <circle
          cx={position.x}
          cy={position.z}
          r={1.6}
          fill="white"
          stroke="#10262d"
          strokeWidth=".6"
        />
      </svg>
      <div>
        {world.sites.map((s) => (
          <button key={s.id} onClick={() => onSelect(s.id)}>
            <b style={{ color }}>{s.index + 1}</b>
            {s.name}
          </button>
        ))}
      </div>
    </nav>
  );
}
