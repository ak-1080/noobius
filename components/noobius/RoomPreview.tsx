import { OBJECTS, ZONES, type Facility, type ZoneId } from '@/lib/facility';

// Original, lightweight floor previews. Empty pads remain empty until built.
export default function RoomPreview({
  room,
  facility,
}: {
  room: ZoneId;
  facility: Facility;
}) {
  const color = ZONES.find((zone) => zone.id === room)!.color;
  const plots = OBJECTS.filter(
    (object) => object.kind === 'build' && object.zone === room,
  );
  return (
    <svg
      viewBox="0 0 300 180"
      className="room-preview"
      role="img"
      aria-label={`${ZONES.find((zone) => zone.id === room)!.name} preview`}
    >
      <ellipse cx="150" cy="151" rx="116" ry="19" fill="#041017" opacity=".5" />
      <path
        d="M25 100 147 45 275 100 153 159Z"
        fill="#16313e"
        stroke={color}
        strokeWidth="2"
      />
      <path
        d="M25 100V64L147 10 275 64V100L147 45Z"
        fill="#0b202c"
        stroke="#476574"
      />
      <path
        d="M35 65 147 17 265 67"
        fill="none"
        stroke={color}
        strokeWidth="3"
      />
      <path
        d="m67 81 126 58m-86-77 127 57M66 119l121-55M108 139l121-56"
        fill="none"
        stroke={color}
        opacity=".14"
      />
      {room === 'thermal' &&
        [86, 205].map((x) => (
          <g key={x} transform={`translate(${x} 64)`}>
            <rect
              x="-18"
              y="-19"
              width="36"
              height="37"
              rx="5"
              fill="#27434d"
              stroke={color}
            />
            <circle r="13" fill="#102833" stroke={color} />
            <path
              d="M0-11Q9-7 3-1Q11 5 6 10Q-3 8-2 3Q-11 8-11 0Q-5-6-2-2Q-7-10 0-11"
              fill={color}
            />
          </g>
        ))}
      {room === 'compute' && (
        <g fill="none" stroke={color} strokeWidth="3">
          <path d="m72 60 42-19 32 15-42 20Z" />
          <path d="m170 54 42 18m-38-9 42 18m-49-8 42 18" />
          <path d="m99 44 9-12m6 14 10-9m-18 34-8 10" />
        </g>
      )}
      {room === 'network' && (
        <g fill="none" stroke={color} strokeWidth="4">
          <path d="M72 98V54L147 22 229 57V99" />
          <path d="M91 90V65L147 40 210 68V90" opacity=".5" />
        </g>
      )}
      {room === 'core' && (
        <g fill="none" stroke={color}>
          <ellipse cx="145" cy="62" rx="31" ry="12" strokeWidth="3" />
          <ellipse cx="145" cy="62" rx="15" ry="27" strokeWidth="3" />
          <path d="m145 38 12 25-12 22-12-22Z" fill={color} opacity=".3" />
        </g>
      )}
      {room === 'commons' && (
        <g transform="translate(138 56)">
          <rect x="-11" y="-17" width="22" height="25" rx="8" fill={color} />
          <rect x="-8" y="-12" width="16" height="10" rx="4" fill="#102c31" />
          <circle cx="-3" cy="-7" r="2" fill="#dfffc5" />
          <circle cx="4" cy="-7" r="2" fill="#dfffc5" />
          <path d="m-7 9-3 9m17-9 3 9" stroke={color} strokeWidth="5" />
        </g>
      )}
      {room === 'salvage' &&
        [88, 149, 210].map((x, i) => (
          <g key={x} transform={`translate(${x} ${85 + (i % 2) * 25})`}>
            <path d="m-21 0 20-9 23 9-21 10Z" fill={color} />
            <path
              d="m-21 0v18l22 9V10m0 0 22-10v18L1 27"
              fill="#294351"
              stroke={color}
            />
            <path d="m-12-5 4-15 15 2 4 14" fill="#b59e71" />
          </g>
        ))}
      {room === 'workshop' && (
        <g fill="#294351" stroke={color} strokeWidth="3">
          <path d="m88 99 49-24 75 34-48 23Z" />
          <path d="M88 99v28m76 5v23m48-46v28" />
          <path d="m118 91 18-9 26 12-18 8Z" fill={color} />
          <path d="m168 87 14-18m-15 19 17 8" />
        </g>
      )}
      {plots.map((plot, index) => {
        const level = facility.builds[plot.id] ?? 0;
        const x = plots.length > 1 ? 104 + index * 86 : 153;
        return (
          <g key={plot.id} transform={`translate(${x} 114)`}>
            <ellipse
              rx="25"
              ry="12"
              fill="#081f2c"
              stroke={color}
              strokeDasharray={level ? undefined : '4 3'}
            />
            {level ? (
              <g>
                <path
                  d={`M-19 0v-${level * 14 + 8}l21-9 17 8v${level * 14 + 8}L0 9Z`}
                  fill="#102532"
                  stroke={color}
                />
                {Array.from({ length: level }, (_, i) => (
                  <path
                    key={i}
                    d={`m-13 ${-i * 14 - 4} 19 7`}
                    stroke={color}
                    strokeWidth="4"
                  />
                ))}
              </g>
            ) : (
              <path d="M-10 0h20M0-6v12" stroke={color} strokeWidth="3" />
            )}
          </g>
        );
      })}
    </svg>
  );
}
