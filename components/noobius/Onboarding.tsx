'use client';
import { useState } from 'react';
import { ArrowRight, Check, Headphones, HardHat, Cpu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OUTFITS, type Facility } from '@/lib/facility';
import AvatarPreview from './AvatarPreview';
import MissionVisual from './MissionVisual';

export default function Onboarding({
  name,
  facility,
  onName,
  onWear,
  onComplete,
  busy,
}: {
  name: string;
  facility: Facility;
  onName: (name: string) => Promise<unknown>;
  onWear: (type: string, id: string) => Promise<unknown>;
  onComplete: () => Promise<unknown>;
  busy: boolean;
}) {
  const [step, setStep] = useState(0),
    [draft, setDraft] = useState(name === 'Practice Noob' ? '' : name),
    [saving, setSaving] = useState(false),
    [error, setError] = useState('');
  const [outfit, setOutfit] = useState(facility.outfit),
    [accessory, setAccessory] = useState(facility.accessory ?? 'none');
  const current = OUTFITS.find((o) => o.id === outfit) ?? OUTFITS[0];
  const locked = busy || saving;
  async function next() {
    if (locked) return;
    setError('');
    setSaving(true);
    try {
      if (step === 0) {
        if (!/^[A-Za-z0-9 _-]{2,20}$/.test(draft.trim())) {
          setError('2–20 letters or numbers. Spaces, _ and - are okay.');
          return;
        }
        if (!(await onName(draft.trim()))) {
          setError('Couldn’t save your name. Try again.');
          return;
        }
        setStep(1);
      } else if (step === 1) {
        if (
          !(await onWear('outfit', outfit)) ||
          !(await onWear('accessory', accessory))
        ) {
          setError('Couldn’t save your look. Try again.');
          return;
        }
        setStep(2);
      } else if (!(await onComplete()))
        setError('Couldn’t start your shift. Try again.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="onboarding-screen" aria-label="Create your Noobius">
      <div className="onboarding-card">
        <ol className="onboarding-steps" aria-label="Setup progress">
          {['Name', 'Look', 'Play'].map((label, i) => (
            <li
              key={label}
              aria-current={step === i ? 'step' : undefined}
              className={i <= step ? 'active' : ''}
            >
              <span>{i < step ? <Check size={15} /> : i + 1}</span>
              {label}
            </li>
          ))}
        </ol>
        <div className="onboarding-content">
          <div className="onboarding-character">
            <AvatarPreview color={current.color} accessory={accessory} />
            <strong>{draft.trim() || 'Your Noobius'}</strong>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void next();
            }}
            className="onboarding-form"
          >
            <span className="onboarding-kicker">
              {step === 0
                ? 'MAKE IT YOURS'
                : step === 1
                  ? 'LOOKING GOOD'
                  : 'YOUR FIRST MISSION'}
            </span>
            <h1>
              {step === 0
                ? 'What’s your name?'
                : step === 1
                  ? 'Pick your look.'
                  : 'Power up one rack.'}
            </h1>
            {step === 0 && (
              <>
                <label htmlFor="starter-name">Username</label>
                <input
                  id="starter-name"
                  autoFocus
                  autoComplete="off"
                  maxLength={20}
                  value={draft}
                  placeholder="e.g. GPU_Goblin"
                  onChange={(e) => setDraft(e.target.value)}
                  disabled={locked}
                />
              </>
            )}
            {step === 1 && (
              <>
                <label>Shirt</label>
                <div className="starter-swatches">
                  {OUTFITS.filter(
                    (o) => o.price === 0 && o.id !== 'afterhours',
                  ).map((o) => (
                    <button
                      type="button"
                      key={o.id}
                      aria-label={o.name}
                      aria-pressed={outfit === o.id}
                      disabled={locked}
                      onClick={() => setOutfit(o.id)}
                      style={{ background: o.color }}
                    >
                      {outfit === o.id && <Check size={22} />}
                    </button>
                  ))}
                </div>
                <label>Headwear</label>
                <div className="starter-headwear">
                  {[
                    { id: 'none', name: 'Headset', Icon: Headphones },
                    { id: 'cap', name: 'Cap', Icon: HardHat },
                  ].map((o) => (
                    <button
                      type="button"
                      key={o.id}
                      aria-pressed={accessory === o.id}
                      onClick={() => setAccessory(o.id)}
                      disabled={locked}
                    >
                      <o.Icon size={28} />
                      {o.name}
                      {accessory === o.id && <Check size={16} />}
                    </button>
                  ))}
                </div>
              </>
            )}
            {step === 2 && (
              <>
                <MissionVisual />
                <p className="mission-payoff">
                  <Cpu size={20} />
                  Your rack earns Compute.
                </p>
              </>
            )}
            {error && (
              <p role="alert" className="onboarding-error">
                {error}
              </p>
            )}
            <Button
              type="submit"
              className="primary-action"
              disabled={locked || (step === 0 && !draft.trim())}
            >
              {locked ? 'Saving…' : step === 2 ? 'Let’s play' : 'Continue'}
              <ArrowRight size={20} />
            </Button>
            {step > 0 && (
              <button
                type="button"
                className="text-action"
                disabled={locked}
                onClick={() => setStep(step - 1)}
              >
                Back
              </button>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}
