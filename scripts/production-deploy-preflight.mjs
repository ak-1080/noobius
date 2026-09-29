// This release path is for the current production game with token checkout off.
// Enabling payments or raising capacity needs a separately accepted release path.
const ACCOUNT_ID = '818bac5a5a12b327928ded9344c453bb';
const DATABASE_ID = 'b9466163-a44d-446d-8616-ca5003f5d24f';
const DATABASE_NAME = 'noobius-game-production';

function productionDatabase(config) {
  return (
    config?.account_id === ACCOUNT_ID &&
    Array.isArray(config.d1_databases) &&
    config.d1_databases.length === 1 &&
    config.d1_databases[0]?.binding === 'DB' &&
    config.d1_databases[0]?.database_name === DATABASE_NAME &&
    config.d1_databases[0]?.database_id === DATABASE_ID
  );
}

// These Workers already have account-managed custom domains. This guarded
// release must not introduce or clear routes, including the coming-soon domain.
function keepsManagedRoutes(config) {
  return config?.route === undefined && config?.routes === undefined;
}

function pausedMainnet(config) {
  return (
    config?.vars?.NOOBIUS_PAYMENTS_ENABLED === 'false' &&
    config.vars.NOOBIUS_TOKEN_ECOSYSTEM === 'solana' &&
    config.vars.NOOBIUS_SOLANA_NETWORK === 'mainnet-beta' &&
    config.vars.NOOBIUS_TRADE_HOLD_24H === 'true'
  );
}

function productionGame(config) {
  const cap = Number(config?.vars?.NOOBIUS_MAX_PLAYERS);
  return (
    config?.name === 'noobius-game' &&
    keepsManagedRoutes(config) &&
    productionDatabase(config) &&
    pausedMainnet(config) &&
    config.workers_dev === false &&
    config.preview_urls === false &&
    config.vars.NOOBIUS_SITE_ORIGIN === 'https://play.noobius.io' &&
    config.vars.NOOBIUS_ROOM_AUTH_ENABLED === 'true' &&
    config.vars.NOOBIUS_LOCAL_REALM_TEST === 'false' &&
    Number.isSafeInteger(cap) &&
    cap >= 1 &&
    cap <= 50
  );
}

export function assertProductionTargets({ game, rooms, recovery } = {}) {
  if (
    !productionGame(game) ||
    game.d1_databases[0].migrations_dir !== '../../drizzle'
  )
    throw Error('Unexpected production game destination or release settings.');
  if (
    rooms?.name !== 'noobius-rooms' ||
    !keepsManagedRoutes(rooms) ||
    rooms.account_id !== ACCOUNT_ID ||
    rooms.workers_dev !== false ||
    rooms.preview_urls !== false ||
    rooms.vars?.NOOBIUS_ROOM_AUTH_ENABLED !== 'true' ||
    !Array.isArray(rooms.services) ||
    rooms.services.length !== 1 ||
    rooms.services[0]?.binding !== 'GAME' ||
    rooms.services[0]?.service !== game.name ||
    rooms.services[0]?.environment !== undefined ||
    !Array.isArray(rooms.durable_objects?.bindings) ||
    rooms.durable_objects.bindings.length !== 1 ||
    rooms.durable_objects.bindings[0]?.name !== 'ROOMS' ||
    rooms.durable_objects.bindings[0]?.class_name !== 'NeighborhoodRoom' ||
    rooms.durable_objects.bindings[0]?.script_name !== undefined
  )
    throw Error('Unexpected production room destination or game binding.');
  if (
    recovery?.name !== 'noobius-payment-recovery' ||
    !keepsManagedRoutes(recovery) ||
    !productionDatabase(recovery) ||
    !pausedMainnet(recovery) ||
    recovery.workers_dev !== false ||
    recovery.preview_urls !== false ||
    recovery.d1_databases[0].migrations_dir !== '../../drizzle'
  )
    throw Error(
      'Unexpected production payment recovery destination or release settings.',
    );
}

export function assertProductionBuild(built, game) {
  if (
    !productionGame(built) ||
    built.vars.NOOBIUS_MAX_PLAYERS !== game?.vars?.NOOBIUS_MAX_PLAYERS ||
    built.vars.NOOBIUS_ADMISSION_PAUSED !== game?.vars?.NOOBIUS_ADMISSION_PAUSED
  )
    throw Error(
      'Built game does not match the production destination and release settings.',
    );
}
