// A lightweight, code-drawn preview of the same stacked tiers used in the world.
// It updates with saved levels without mounting another WebGL renderer.
export default function MachinePreview({ level }: { level: number }) {
  const tiers = Math.max(0, Math.min(3, level));
  const height = tiers * 30;
  return (
    <svg
      className="machine-preview"
      viewBox="0 0 220 180"
      role="img"
      aria-label={
        tiers
          ? `Level ${tiers} machine with ${tiers} hardware ${tiers === 1 ? 'tier' : 'tiers'}`
          : 'Empty build pad'
      }
    >
      <ellipse cx="113" cy="148" rx="83" ry="18" fill="#000" opacity=".18" />
      <path
        d="M40 130 110 101 184 132 114 162Z"
        fill="#173b43"
        stroke="#618b85"
        strokeWidth="2"
      />
      {tiers === 0 ? (
        <g>
          <ellipse
            cx="111"
            cy="133"
            rx="41"
            ry="17"
            fill="none"
            stroke="#b7e98d"
            strokeWidth="3"
            strokeDasharray="5 4"
          />
          <path
            d="m92 133 38 0m-19-10v20"
            stroke="#c4ef9a"
            strokeWidth="7"
            strokeLinecap="round"
          />
        </g>
      ) : (
        <g>
          <g transform={`translate(62 ${120 - height}) skewY(18)`}>
            <rect
              width="68"
              height={height}
              rx="2"
              fill="#142d37"
              stroke="#578082"
            />
            {Array.from({ length: tiers }, (_, i) => (
              <g key={i} transform={`translate(0 ${i * 30})`}>
                <rect
                  x="5"
                  y="4"
                  width="58"
                  height="22"
                  rx="2"
                  fill="#071b26"
                  stroke="#355c67"
                />
                <path d="M21 11h18M21 17h18" stroke="#50767c" strokeWidth="2" />
                <rect x="10" y="8" width="6" height="5" rx="1" fill="#c4f28c" />
                <rect
                  x="10"
                  y="16"
                  width="6"
                  height="3"
                  rx="1"
                  fill="#63cec5"
                />
                <circle cx="51" cy="15" r="7" fill="none" stroke="#88aaa6" />
                <path d="m51 9 0 12m-6-6h12" stroke="#88aaa6" />
              </g>
            ))}
          </g>
          <g transform={`translate(130 ${142 - height}) skewY(-22)`}>
            <rect width="40" height={height} fill="#0b202b" stroke="#3f6671" />
            {Array.from({ length: tiers }, (_, i) => (
              <path
                key={i}
                d={`M7 ${i * 30 + 10}h25m-25 5h25m-25 5h25`}
                stroke="#244553"
              />
            ))}
          </g>
          <path
            d={`M62 ${120 - height} 102 ${104 - height} 170 ${126 - height} 130 ${142 - height}Z`}
            fill="#416b72"
            stroke="#81a3a0"
          />
          <path
            d={`M69 ${120 - height} 130 ${139 - height} 163 ${126 - height}`}
            fill="none"
            stroke="#c4f28c"
            strokeWidth="3"
          />
          {tiers === 3 && (
            <g fill="#173d49" stroke="#94bbb7">
              <ellipse cx="107" cy="26" rx="10" ry="5" />
              <ellipse cx="135" cy="35" rx="10" ry="5" />
            </g>
          )}
        </g>
      )}
    </svg>
  );
}
