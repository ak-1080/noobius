export default function ComputeIcon({ size = 24 }: { size?: number }) {
  return (
    <img
      className="compute-icon"
      src="/assets/compute-currency.png"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0 }}
    />
  );
}
