'use client';
import { ArrowRight, Lock, Check, Radio } from 'lucide-react';
import { REALMS, realmRequirement, type RealmId } from '@/lib/realm-catalog';
import { playerProgress } from '@/lib/progression';
import { operatorLicense, careerFor } from '@/lib/contracts';
import type { Facility } from '@/lib/facility';
import type { RealmAccess } from '@/lib/realm-access';
import { Button } from '@/components/ui/button';
export default function RealmDirectory({
  xp,
  facility,
  practice,
  current,
  atHome,
  access,
  loading,
  traveling,
  onTravel,
  onWork,
  onJobs,
}: {
  xp: number;
  facility: Facility;
  practice: boolean;
  current: RealmId;
  atHome: boolean;
  access: RealmAccess | null;
  loading: boolean;
  traveling: boolean;
  onTravel: (realm: RealmId) => void;
  onWork: () => void;
  onJobs: () => void;
}) {
  const progress = playerProgress(xp),
    licensed = operatorLicense(careerFor(facility));
  return (
    <div className="realm-directory">
      <div className="player-level-card">
        <span className="player-level-number">{progress.level}</span>
        <div>
          <strong>Player level {progress.level}</strong>
          <p>
            {progress.remaining} XP to level {progress.level + 1}
          </p>
          <progress
            max={100}
            value={progress.percent}
            aria-label="XP toward next player level"
          />
          <small>
            Earn XP from jobs, crafting and field recoveries. Tokens do not add
            XP.
          </small>
        </div>
      </div>
      <div className="realm-directory-heading">
        <h3>Choose your next world</h3>
        <span>Your center travels with you.</span>
      </div>
      {practice && (
        <p className="realm-practice-note">
          Solo practice: explore earned realms without a wallet. Live holder
          realms need verified access. Practice items stay in this browser.
        </p>
      )}
      <div className="realm-cards">
        {REALMS.map((realm) => {
          const gate = realmRequirement(realm.id, xp, practice || licensed);
          const blocked =
            !practice && realm.holderOnly && (loading || !access?.allowed);
          const here = current === realm.id && !atHome;
          return (
            <article
              key={realm.id}
              className={`realm-card ${here ? 'current' : ''}`}
              style={{ '--realm-color': realm.color } as React.CSSProperties}
            >
              <div className="realm-card-top">
                <span>LEVEL {realm.minimumLevel}</span>
                <span>{realm.holderOnly ? 'Holder realm' : 'Free realm'}</span>
              </div>
              <h3>{realm.name}</h3>
              <p>{realm.description}</p>
              <div className="realm-card-activity">
                <Radio size={19} />
                <span>
                  <strong>{realm.activity}</strong>
                  <small>{realm.purpose}</small>
                </span>
              </div>
              <div className="realm-card-proof">
                <Check size={16} />
                {facility.fieldWork?.completed[realm.id] ?? 0} recoveries
                completed
              </div>
              {gate && (
                <p className="realm-gate">
                  <Lock size={16} />
                  {gate}
                </p>
              )}
              {realm.holderOnly && !practice && (
                <p className="realm-gate">
                  {loading
                    ? 'Checking holdings…'
                    : access?.status === 'unconfigured'
                      ? 'Token access opens after the token is configured.'
                      : (access?.message ?? 'Connect to verify token access.')}
                </p>
              )}
              {realm.holderOnly &&
                !practice &&
                access &&
                !['unconfigured', 'unsupported', 'test'].includes(
                  access.status,
                ) && (
                  <small>
                    Hold {access.threshold} $NOOBIUS. No tokens are spent to
                    enter.
                  </small>
                )}
              <Button
                className={here ? 'primary-action' : ''}
                variant={here ? 'default' : 'outline'}
                disabled={traveling || !!gate || blocked}
                onClick={() => (here ? onWork() : onTravel(realm.id))}
              >
                {here
                  ? 'Open field station'
                  : gate
                    ? progress.level < realm.minimumLevel
                      ? `Unlock at level ${realm.minimumLevel}`
                      : 'Operator license required'
                    : blocked
                      ? 'Holder access required'
                      : practice
                        ? 'Explore solo'
                        : 'Enter realm'}
                <ArrowRight size={17} />
              </Button>
            </article>
          );
        })}
      </div>
      <Button variant="outline" onClick={onJobs}>
        Earn XP with a job
        <ArrowRight size={17} />
      </Button>
    </div>
  );
}
