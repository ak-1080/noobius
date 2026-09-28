// Generated signing identities only. These files must never contain user keys.
// This helper performs no network requests and never signs transactions.
import {
  constants,
  closeSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { createHash, createPrivateKey, createPublicKey } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { base58 } from '@scure/base';
import { assertFreshCapacityAccounts } from './capacity-auth.mjs';

const STAGING = 'https://noobius-game-staging.rinkydooonso.workers.dev';
const PURPOSE = 'noobius-generated-capacity-qa';
const GENERATOR = 'scripts/capacity-cohort.mjs';
const MAX_BYTES = 128 * 1024;
const MAX_ACTORS = 100;
const profileId = (id) => typeof id === 'string' && /^[a-f0-9]{32}$/.test(id);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fail = (message) => {
  throw new Error('Capacity cohort: ' + message);
};
const exactKeys = (value, keys) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value)
    .sort((a, b) => a.localeCompare(b))
    .join('|') === [...keys].sort((a, b) => a.localeCompare(b)).join('|');

function privateFile(path, flags = constants.O_RDONLY) {
  const fd = openSync(path, flags | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (
      !stat.isFile() ||
      stat.nlink !== 1 ||
      stat.uid !== process.getuid() ||
      (stat.mode & 0o777) !== 0o600 ||
      stat.size < 1 ||
      stat.size > MAX_BYTES
    )
      fail('requires a single owner-only 0600 file of bounded size.');
    return { fd, stat };
  } catch (error) {
    closeSync(fd);
    throw error;
  }
}

function safePath(path, cwd, createDirectory = false) {
  if (typeof process.getuid !== 'function' || !constants.O_NOFOLLOW)
    fail(
      'this host cannot enforce private file ownership and no-follow opens.',
    );
  if (typeof path !== 'string' || !path || path.includes('\0'))
    fail(
      'an explicit ignored .wrangler/capacity-cohorts/*.json file is required.',
    );
  const project = realpathSync(cwd),
    root = resolve(project, '.wrangler/capacity-cohorts');
  const target = resolve(cwd, path);
  if (
    dirname(target) !== root ||
    !/^[a-z0-9][a-z0-9-]{0,63}\.json$/.test(basename(target))
  )
    fail(
      'files must be directly inside the project .wrangler/capacity-cohorts directory.',
    );
  for (const folder of [resolve(project, '.wrangler'), root]) {
    try {
      const stat = lstatSync(folder);
      if (
        !stat.isDirectory() ||
        stat.isSymbolicLink() ||
        stat.uid !== process.getuid()
      )
        fail(
          'the ignored directories must be owned directories, without symlinks.',
        );
      if (folder === root && (stat.mode & 0o777) !== 0o700)
        fail('the capacity-cohorts directory must have 0700 permissions.');
    } catch (error) {
      if (error.code !== 'ENOENT' || !createDirectory) throw error;
      mkdirSync(folder, { mode: 0o700 });
    }
  }
  return target;
}

function lock(path) {
  let fd;
  try {
    fd = openSync(
      path + '.lock',
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    );
  } catch (error) {
    if (error.code === 'EEXIST')
      fail(
        'this file is already in use; verify the earlier run ended before removing its lock.',
      );
    throw error;
  }
  const owned = fstatSync(fd);
  try {
    writeFileSync(fd, String(process.pid));
  } finally {
    closeSync(fd);
  }
  return () => {
    const current = lstatSync(path + '.lock');
    if (
      current.dev !== owned.dev ||
      current.ino !== owned.ino ||
      current.isSymbolicLink()
    )
      fail('lock ownership changed; cleanup refused.');
    unlinkSync(path + '.lock');
  };
}

function read(path) {
  const { fd } = privateFile(path);
  let bytes;
  try {
    bytes = readFileSync(fd);
  } finally {
    closeSync(fd);
  }
  if (bytes.length > MAX_BYTES) fail('file exceeds the bounded size.');
  let document;
  try {
    document = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail('invalid JSON; no key material is included in this error.');
  }
  return { document, hash: digest(bytes) };
}

async function validate(document, origin, returning) {
  if (origin !== STAGING) fail('persisted cohorts are devnet staging only.');
  if (
    !exactKeys(document, [
      'schemaVersion',
      'purpose',
      'generator',
      'origin',
      'network',
      'cohortId',
      'createdAt',
      'actors',
    ]) ||
    document.schemaVersion !== 1 ||
    document.purpose !== PURPOSE ||
    document.generator !== GENERATOR ||
    document.origin !== origin ||
    document.network !== 'devnet' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      document.cohortId,
    ) ||
    typeof document.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(document.createdAt)) ||
    new Date(document.createdAt).toISOString() !== document.createdAt ||
    !Array.isArray(document.actors) ||
    !document.actors.length ||
    document.actors.length > MAX_ACTORS
  )
    fail(
      'schema, generated provenance, staging origin or devnet network is invalid.',
    );
  const seenAddresses = new Set(),
    seenProfiles = new Set(),
    actors = [];
  for (const actor of document.actors) {
    if (
      !exactKeys(actor, [
        'address',
        'privateKeyPkcs8',
        'registeredProfileId',
      ]) ||
      typeof actor.address !== 'string' ||
      typeof actor.privateKeyPkcs8 !== 'string' ||
      actor.privateKeyPkcs8.length > 128 ||
      (actor.registeredProfileId !== null &&
        !profileId(actor.registeredProfileId)) ||
      (returning && !profileId(actor.registeredProfileId))
    )
      fail(
        'each generated identity needs a valid key record and returning runs require registered saved profile IDs.',
      );
    let bytes, publicBytes, privateKey;
    try {
      bytes = Buffer.from(actor.privateKeyPkcs8, 'base64');
      if (
        bytes.toString('base64') !== actor.privateKeyPkcs8 ||
        bytes.length !== 48
      )
        throw Error();
      const nodeKey = createPrivateKey({
        key: bytes,
        format: 'der',
        type: 'pkcs8',
      });
      if (nodeKey.asymmetricKeyType !== 'ed25519') throw Error();
      const jwk = createPublicKey(nodeKey).export({ format: 'jwk' });
      publicBytes = Buffer.from(jwk.x, 'base64url');
      if (base58.encode(publicBytes) !== actor.address) throw Error();
      privateKey = await crypto.subtle.importKey(
        'pkcs8',
        bytes,
        'Ed25519',
        false,
        ['sign'],
      );
    } catch {
      fail('a generated Ed25519 address does not match its private key.');
    }
    if (
      seenAddresses.has(actor.address) ||
      (actor.registeredProfileId && seenProfiles.has(actor.registeredProfileId))
    )
      fail('duplicate generated identity or saved profile.');
    seenAddresses.add(actor.address);
    if (actor.registeredProfileId) seenProfiles.add(actor.registeredProfileId);
    actors.push({
      address: actor.address,
      keys: { privateKey },
      returningProfileId: actor.registeredProfileId,
    });
  }
  return actors;
}

function newDocument(actors) {
  return {
    schemaVersion: 1,
    purpose: PURPOSE,
    generator: GENERATOR,
    origin: STAGING,
    network: 'devnet',
    cohortId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    actors,
  };
}

function removeTemporary(path) {
  try {
    unlinkSync(path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function create(path, document) {
  const contents = JSON.stringify(document, null, 2);
  const fd = openSync(
    path,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    writeFileSync(fd, contents);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  return digest(contents);
}

// Validation and lock acquisition finish before the caller makes any request.
// Returning mode accepts only complete registered files; it never imports keys
// from devnet payment-wallet files or arbitrary paths.
export async function openCapacityCohort({
  path,
  origin,
  count,
  mode,
  cwd = process.cwd(),
}) {
  if (origin !== STAGING) fail('persisted cohorts are devnet staging only.');
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_ACTORS)
    fail('selected actor count is invalid.');
  if (!['create', 'returning'].includes(mode))
    fail('explicit mode must be create or returning.');
  if (mode === 'create') assertFreshCapacityAccounts(count);
  const target = safePath(path, cwd, mode === 'create'),
    unlock = lock(target);
  let opened = false;
  try {
    let document, hash;
    if (mode === 'create') {
      // Refuse an existing file before allocating keys. There is no overwrite or adoption option.
      try {
        lstatSync(target);
        fail('create mode refuses an existing file.');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      const entries = [];
      for (let i = 0; i < count; i++) {
        const keys = await crypto.subtle.generateKey('Ed25519', true, [
          'sign',
          'verify',
        ]);
        entries.push({
          address: base58.encode(
            new Uint8Array(
              await crypto.subtle.exportKey('raw', keys.publicKey),
            ),
          ),
          privateKeyPkcs8: Buffer.from(
            await crypto.subtle.exportKey('pkcs8', keys.privateKey),
          ).toString('base64'),
          registeredProfileId: null,
        });
      }
      document = newDocument(entries);
      hash = create(target, document);
    } else ({ document, hash } = read(target));
    const actors = await validate(document, origin, mode === 'returning');
    if (actors.length < count)
      fail(
        'not enough registered generated identities for the requested rooms.',
      );
    opened = true;
    let closed = false;
    return {
      actors: actors.slice(0, count),
      mode,
      cohortId: document.cohortId,
      registeredCount: actors.filter((a) => a.returningProfileId).length,
      register(index, id) {
        if (
          closed ||
          mode !== 'create' ||
          !Number.isSafeInteger(index) ||
          index < 0 ||
          index >= count ||
          !profileId(id)
        )
          fail('invalid generated identity registration.');
        if (
          document.actors[index].registeredProfileId &&
          document.actors[index].registeredProfileId !== id
        )
          fail('registered saved profile changed.');
        if (
          document.actors.some(
            (a, i) => i !== index && a.registeredProfileId === id,
          )
        )
          fail('duplicate saved profile registration.');
        if (read(target).hash !== hash)
          fail('file changed during use; registration refused.');
        document.actors[index].registeredProfileId = id;
        const temporary = target + '.write-' + crypto.randomUUID();
        try {
          const replacement = create(temporary, document);
          // Re-check the original after preparing the replacement.
          if (read(target).hash !== hash)
            fail('file changed during use; replacement refused.');
          renameSync(temporary, target);
          hash = replacement;
        } finally {
          removeTemporary(temporary);
        }
        actors[index].returningProfileId = id;
      },
      close() {
        if (!closed) {
          unlock();
          closed = true;
        }
      },
    };
  } finally {
    if (!opened) unlock();
  }
}

export async function mergeCapacityCohorts({
  output,
  inputs,
  cwd = process.cwd(),
}) {
  if (!Array.isArray(inputs) || inputs.length < 2 || inputs.length > 20)
    fail('merge requires two to twenty complete generated cohort files.');
  const target = safePath(output, cwd, true),
    unlock = lock(target),
    held = [];
  try {
    const entries = [];
    for (const input of inputs) {
      const source = safePath(input, cwd);
      if (source === target) fail('output must differ from every input.');
      const release = lock(source);
      held.push(release);
      const { document } = read(source);
      await validate(document, STAGING, true);
      entries.push(...document.actors);
    }
    const document = newDocument(entries);
    await validate(document, STAGING, true);
    create(target, document);
    return { actors: entries.length, origin: STAGING, network: 'devnet' };
  } finally {
    for (const release of held.reverse()) release();
    unlock();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  if (process.argv[2] !== 'merge' || process.argv.length < 6)
    fail(
      'usage: node scripts/capacity-cohort.mjs merge <ignored-output.json> <ignored-input.json> <ignored-input.json> [...]',
    );
  const result = await mergeCapacityCohorts({
    output: process.argv[3],
    inputs: process.argv.slice(4),
  });
  console.log(
    JSON.stringify({ status: 'merged-generated-cohorts', ...result }),
  );
}
