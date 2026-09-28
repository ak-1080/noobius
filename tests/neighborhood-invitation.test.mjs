import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNeighborhoodInvitation } from '../lib/neighborhood-invitation.ts';
import { REALMS } from '../lib/realm-catalog.ts';
const target = 'fc221c2206cf441da930f3901ec62915';

void test('plain invitation codes and copied links reach the same neighborhood in every realm', () => {
  for (const { id: realm } of REALMS) {
    const expected = { realm, target };
    assert.deepEqual(
      parseNeighborhoodInvitation(`  ${realm}:${target}\n`),
      expected,
    );
    assert.deepEqual(
      parseNeighborhoodInvitation(
        `https://play.noobius.io/?neighborhood=${target}&realm=${realm}`,
      ),
      expected,
    );
    assert.deepEqual(
      parseNeighborhoodInvitation(
        `http://127.0.0.1:3003/?realm=${realm}&neighborhood=${target}`,
      ),
      expected,
    );
  }
  assert.deepEqual(
    parseNeighborhoodInvitation(
      `https://play.noobius.io/?neighborhood=${target}`,
    ),
    { realm: 'commons', target },
  );
});

void test('malformed, ambiguous or unrelated invitation inputs never produce a travel command', () => {
  for (const input of [
    '',
    'commons:',
    `unknown:${target}`,
    `commons:${target.slice(1)}`,
    `commons:${target}1`,
    `commons:${target.toUpperCase()}`,
    `javascript:commons:${target}`,
    `ftp://example.org/?neighborhood=${target}`,
    `https://user:password@example.org/?neighborhood=${target}`,
    'https://play.noobius.io/?realm=commons',
    `https://play.noobius.io/?neighborhood=${target}&neighborhood=${target}`,
    `https://play.noobius.io/?neighborhood=${target}&realm=commons&realm=gpu`,
    `https://play.noobius.io/?neighborhood=${target}&realm=unknown`,
    'x'.repeat(3001),
  ])
    assert.equal(parseNeighborhoodInvitation(input), null, input.slice(0, 120));
});
