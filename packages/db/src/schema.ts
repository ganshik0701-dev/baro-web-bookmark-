// Drizzle 스키마. supabase/migrations의 SQL과 1:1로 맞춘 "쿼리용 타입 정의"다.
// 실제 테이블은 SQL 마이그레이션이 만든다. 이 파일로 마이그레이션을 생성하지 않는다.
// RLS 정책·트리거·record_visit 함수는 SQL(003, 004)에만 있다.
// 컬럼을 바꿀 때는 docs/02-db.md → SQL → 이 파일 순서로 고친다.
import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  char,
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { authUsers } from 'drizzle-orm/supabase'

// 사용자 설정. id가 곧 auth.users.id
export const profiles = pgTable('profiles', {
  id: uuid('id')
    .primaryKey()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }).notNull(),
  displayName: varchar('display_name', { length: 50 }),
  avatarUrl: text('avatar_url'),
  sortOption: varchar('sort_option', { length: 20 }).notNull().default('created_desc'),
  openMode: varchar('open_mode', { length: 10 }).notNull().default('new_tab'),
  theme: varchar('theme', { length: 10 }).notNull().default('system'),
  autoSync: boolean('auto_sync').notNull().default(true),
  chromeProfile: varchar('chrome_profile', { length: 50 }),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const groups = pgTable(
  'groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 30 }).notNull(),
    position: integer('position').notNull(),
    chromeFolderId: varchar('chrome_folder_id', { length: 50 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // 006에서 DEFERRABLE INITIALLY IMMEDIATE로 다시 만들었다(Drizzle 정의에는 deferrable 표기가 없다)
    unique('groups_user_id_name_key').on(t.userId, t.name),
    index('idx_groups_user').on(t.userId, t.position),
    uniqueIndex('idx_groups_user_chrome')
      .on(t.userId, t.chromeFolderId)
      .where(sql`${t.chromeFolderId} is not null`),
  ],
)

export const bookmarks = pgTable(
  'bookmarks',
  {
    // 문서상 기본값이 없어 INSERT 때 id를 직접 넣어야 한다
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id').references(() => groups.id, { onDelete: 'set null' }),
    title: varchar('title', { length: 100 }).notNull(),
    url: text('url').notNull(),
    normalizedUrl: text('normalized_url').notNull(),
    iconUrl: text('icon_url'),
    source: varchar('source', { length: 15 }).notNull().default('manual'),
    chromeId: varchar('chrome_id', { length: 50 }),
    tags: text('tags').array().notNull().default(sql`'{}'`),
    isPinned: boolean('is_pinned').notNull().default(false),
    position: doublePrecision('position').notNull(),
    clickCount: integer('click_count').notNull().default(0),
    lastVisitedAt: timestamp('last_visited_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('bookmarks_url_check', sql`${t.url} ~ '^https?://'`),
    check('bookmarks_source_check', sql`${t.source} in ('manual', 'app_sync', 'ext_sync', 'html_import')`),
    check(
      'bookmarks_chrome_id_source_check',
      sql`(${t.chromeId} is not null) = (${t.source} in ('app_sync', 'ext_sync'))`,
    ),
    unique('uq_bm_user_url').on(t.userId, t.normalizedUrl),
    uniqueIndex('idx_bm_user_chrome')
      .on(t.userId, t.chromeId)
      .where(sql`${t.chromeId} is not null`),
    index('idx_bm_user_created').on(t.userId, t.createdAt.desc()),
    index('idx_bm_user_visited').on(t.userId, t.lastVisitedAt.desc().nullsLast()),
    index('idx_bm_user_position').on(t.userId, t.groupId, t.position),
    index('idx_bm_tags').using('gin', t.tags),
  ],
)

export const visitLogs = pgTable(
  'visit_logs',
  {
    // 행 수가 2^53을 넘을 일은 없으므로 JS number로 받는다
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    bookmarkId: uuid('bookmark_id')
      .notNull()
      .references(() => bookmarks.id, { onDelete: 'cascade' }),
    // 문서대로 FK 없음 (RLS·집계용 복사값)
    userId: uuid('user_id').notNull(),
    visitedAt: timestamp('visited_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_visit_recent').on(t.bookmarkId, t.visitedAt.desc()),
    index('idx_visit_cleanup').on(t.visitedAt),
  ],
)

export const apiTokens = pgTable(
  'api_tokens',
  {
    // 문서상 기본값이 없어 INSERT 때 id를 직접 넣어야 한다
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 30 }).notNull(),
    tokenHash: char('token_hash', { length: 64 }).notNull(),
    prefix: char('prefix', { length: 8 }).notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('idx_tokens_hash').on(t.tokenHash)],
)
