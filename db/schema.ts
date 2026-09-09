import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
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
export const rateLimits = sqliteTable('rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  resetsAt: integer('resets_at').notNull(),
});

export const presence = sqliteTable(
  'crew_presence',
  {
    room: text('room').notNull().default('campus-1'),
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
  ],
);
export const messages = sqliteTable(
  'crew_messages',
  {
    id: text('id').primaryKey(),
    wallet: text('wallet')
      .notNull()
      .references(() => players.wallet),
    text: text('message').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('idx_messages_time').on(t.createdAt)],
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
  (t) => [index('idx_campus_work_room_event').on(t.room, t.event)],
);
export const campusRewards = sqliteTable('campus_rewards', {
  id: text('id').primaryKey(),
  wallet: text('wallet').notNull(),
  createdAt: integer('created_at').notNull(),
});
