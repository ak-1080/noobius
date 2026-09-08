import { Check, ArrowRight } from 'lucide-react';
export default function MissionVisual({ step = 0 }: { step?: number }) {
  return (
    <div
      className="mission-visual"
      aria-label="Collect parts, make a kit, power up a rack"
    >
      {[
        { file: 'scrap', label: 'Collect parts' },
        { file: 'toolbox', label: 'Make a kit' },
        { file: 'server', label: 'Power up' },
      ].map((item, i) => (
        <div
          key={item.file}
          className={i === step ? 'current' : i < step ? 'complete' : ''}
        >
          <img
            src={`/assets/tutorial/tutorial-${item.file}.png`}
            alt={item.label}
          />
          <strong>
            {i < step ? <Check size={16} /> : <span>{i + 1}</span>}
            {item.label}
          </strong>
          {i < 2 && <ArrowRight className="mission-link" size={18} />}
        </div>
      ))}
    </div>
  );
}
