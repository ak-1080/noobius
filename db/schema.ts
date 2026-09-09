import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
export const players = sqliteTable(
  'players',
  {
    wallet: text('wallet').primaryKey(),
    publicId: text('public_id'),
    name: text('name').notNull(),
    credits: integer('credits').notNull().default(0),
    xp: integer('xp').notNull().default(0),
    shifts: integer('shifts').notNull().default(0),
    bestScore: integer('best_score').notNull().default(0),
    scanner: integer('scanner').notNull().default(0),
    visor: integer('visor').notNull().default(0),
    tracer: integer('tracer').notNull().default(0),
    facilityState: text('facility_state'),
    facilityVersion: integer('facility_version').notNull().default(0),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    index('idx_players_best_score').on(t.bestScore),
    uniqueIndex('idx_players_public_id').on(t.publicId),
  ],
);
export const sessions = sqliteTable(
  'sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    wallet: text('wallet')
      .notNull()
      .references(() => players.wallet),
    expiresAt: integer('expires_at').notNull(),
  },
  (t) => [index('idx_sessions_expiry').on(t.expiresAt)],
);
export const challenges = sqliteTable(
  'challenges',
  {
    tokenHash: text('token_hash').primaryKey(),
    wallet: text('wallet').notNull(),
    message: text('message').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (t) => [index('idx_challenges_expiry').on(t.expiresAt)],
);
export const shifts = sqliteTable(
  'shifts',
  {
    id: text('id').primaryKey(),
    wallet: text('wallet')
      .notNull()
      .references(() => players.wallet),
    state: text('state').notNull(),
    version: integer('version').notNull().default(0),
    mutation: text('mutation').notNull(),
    startedAt: integer('started_at').notNull(),
    completedAt: integer('completed_at'),
  },
  (t) => [
    uniqueIndex('idx_shifts_active_wallet')
      .on(t.wallet)
      .where(sql`${t.completedAt} IS NULL`),
    index('idx_shifts_wallet_started').on(t.wallet, t.startedAt),
  ],
);
export const rateLimits = sqliteTable(
  'rate_limits',
  {
    key: text('key').primaryKey(),
    count: integer('count').notNull(),
    resetsAt: integer('resets_at').notNull(),
  },
  (t) => [index('idx_rate_limits_reset').on(t.resetsAt)],
);

export const neighborhoods = sqliteTable(
  'neighborhoods',
  {
    id: text('id').primaryKey(),
    realm: text('realm').notNull(),
    preferredBand: integer('preferred_band').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('idx_neighborhoods_realm_band').on(t.realm, t.preferredBand)],
);

export const presence = sqliteTable(
  'crew_presence',
  {
    room: text('room').notNull().default('campus-1'),
    neighborhoodId: text('neighborhood_id').references(() => neighborhoods.id),
    slot: integer('slot'),
    clientId: text('client_id'),
    generation: integer('generation').notNull().default(0),
    sequence: integer('sequence').notNull().default(0),
    leaseUntil: integer('lease_until').notNull().default(0),
    wallet: text('wallet')
      .primaryKey()
      .references(() => players.wallet),
    x: integer('x').notNull(),
    z: integer('z').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    index('idx_presence_room_time').on(t.room, t.updatedAt),
    index('idx_presence_time').on(t.updatedAt),
    uniqueIndex('idx_presence_neighborhood_slot').on(t.neighborhoodId, t.slot),
    index('idx_presence_neighborhood_lease').on(t.neighborhoodId, t.leaseUntil),
    index('idx_presence_lease').on(t.leaseUntil),
    check('valid_neighborhood_slot', sql`${t.slot} BETWEEN 0 AND 4`),
  ],
);
export const messages = sqliteTable(
  'crew_messages',
  {
    id: text('id').primaryKey(),
    neighborhoodId: text('neighborhood_id').references(() => neighborhoods.id),
    wallet: text('wallet')
      .notNull()
      .references(() => players.wallet),
    text: text('message').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    index('idx_messages_time').on(t.createdAt),
    index('idx_messages_neighborhood_time').on(t.neighborhoodId, t.createdAt),
  ],
);
export const listings = sqliteTable(
  'market_listings',
  {
    id: text('id').primaryKey(),
    wallet: text('wallet')
      .notNull()
      .references(() => players.wallet),
    item: text('item').notNull(),
    quantity: integer('quantity').notNull(),
    price: integer('price').notNull(),
    status: text('status').notNull().default('open'),
    buyer: text('buyer'),
    recipientWallet: text('recipient_wallet').references(() => players.wallet),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('idx_listings_status_time').on(t.status, t.createdAt)],
);

export const campusWork = sqliteTable(
  'campus_work',
  {
    id: text('id').primaryKey(),
    room: text('room').notNull(),
    event: integer('event').notNull(),
    station: text('station').notNull(),
    wallet: text('wallet').notNull(),
    startedAt: integer('started_at').notNull(),
    completedAt: integer('completed_at'),
  },
  (t) => [
    index('idx_campus_work_room_event').on(t.room, t.event),
    index('idx_campus_work_wallet_completed')
      .on(t.wallet, t.event, t.room)
      .where(sql`${t.completedAt} IS NOT NULL`),
  ],
);
export const campusRewards = sqliteTable('campus_rewards', {
  id: text('id').primaryKey(),
  wallet: text('wallet').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const clusterProjects = sqliteTable(
  'cluster_projects',
  {
    id: text('id').primaryKey(),
    neighborhoodId: text('neighborhood_id')
      .notNull()
      .references(() => neighborhoods.id),
    variant: text('variant').notNull(),
    state: text('state').notNull(),
    scale: integer('scale').notNull(),
    required: text('required_json').notNull(),
    progress: text('progress_json').notNull(),
    version: integer('version').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    completedAt: integer('completed_at'),
  },
  (t) => [
    uniqueIndex('idx_cluster_open')
      .on(t.neighborhoodId)
      .where(sql`${t.state} = 'open'`),
    index('idx_cluster_neighborhood_time').on(t.neighborhoodId, t.createdAt),
  ],
);
export const clusterContributions = sqliteTable(
  'cluster_contributions',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => clusterProjects.id),
    wallet: text('wallet')
      .notNull()
      .references(() => players.wallet),
    family: text('family').notNull(),
    units: integer('units').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    index('idx_cluster_contributions_project').on(t.projectId),
    index('idx_cluster_contributions_wallet').on(t.wallet),
  ],
);
export const clusterClaims = sqliteTable(
  'cluster_claims',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => clusterProjects.id),
    wallet: text('wallet')
      .notNull()
      .references(() => players.wallet),
    compute: integer('compute').notNull(),
    reputation: integer('reputation').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [uniqueIndex('idx_cluster_claim_once').on(t.projectId, t.wallet)],
);

export const realmEntitlements = sqliteTable('realm_entitlements', {
  wallet: text('wallet')
    .primaryKey()
    .references(() => players.wallet),
  policy: text('policy').notNull(),
  amount: text('amount').notNull(),
  block: text('block').notNull(),
  status: text('status').notNull(),
  checkedAt: integer('checked_at').notNull(),
  nextCheckAt: integer('next_check_at').notNull(),
  graceUntil: integer('grace_until').notNull(),
});

export const socialPreferences = sqliteTable(
  'social_preferences',
  {
    wallet: text('wallet')
      .notNull()
      .references(() => players.wallet),
    targetWallet: text('target_wallet')
      .notNull()
      .references(() => players.wallet),
    muted: integer('muted').notNull().default(0),
    blocked: integer('blocked').notNull().default(0),
  },
  (t) => [
    uniqueIndex('idx_social_preference_pair').on(t.wallet, t.targetWallet),
  ],
);

export const playerReports = sqliteTable(
  'player_reports',
  {
    id: text('id').primaryKey(),
    wallet: text('wallet')
      .notNull()
      .references(() => players.wallet),
    targetWallet: text('target_wallet')
      .notNull()
      .references(() => players.wallet),
    messageId: text('message_id').notNull(),
    message: text('message').notNull(),
    reason: text('reason').notNull(),
    createdAt: integer('created_at').notNull(),
    status: text('status').notNull().default('open'),
  },
  (t) => [uniqueIndex('idx_report_message_once').on(t.wallet, t.messageId)],
);

export const recentNeighbors = sqliteTable(
  'recent_neighbors',
  {
    wallet: text('wallet')
      .notNull()
      .references(() => players.wallet),
    targetWallet: text('target_wallet')
      .notNull()
      .references(() => players.wallet),
    lastSeen: integer('last_seen').notNull(),
  },
  (t) => [
    uniqueIndex('idx_recent_neighbor_pair').on(t.wallet, t.targetWallet),
    index('idx_recent_neighbor_time').on(t.wallet, t.lastSeen),
  ],
);
