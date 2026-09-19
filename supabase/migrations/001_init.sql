-- 001_init.sql
-- 바로(baro)의 테이블 5개를 만든다: profiles, groups, bookmarks, visit_logs, api_tokens.
-- 컬럼·타입·제약·기본값은 docs/02-db.md를 그대로 따른다.
-- 데이터 무결성에 직접 필요한 UNIQUE·CHECK 제약도 테이블과 함께 여기서 만든다.
-- (조회 성능용 인덱스는 002_indexes.sql, RLS는 003_rls.sql, 트리거·함수는 004_functions.sql)

-- 사용자 설정. 계정 자체는 auth.users가 관리하고, 여기는 1:1로 붙는 앱 설정만 둔다.
-- 행은 004의 on_auth_user_created 트리거가 첫 로그인 때 만든다.
create table public.profiles (
  id             uuid         primary key references auth.users(id) on delete cascade,
  email          varchar(255) not null,
  display_name   varchar(50),
  avatar_url     text,
  sort_option    varchar(20)  not null default 'created_desc',  -- created_desc / visits_30d / visited_desc / title_asc / custom
  open_mode      varchar(10)  not null default 'new_tab',       -- new_tab / same_tab
  theme          varchar(10)  not null default 'system',        -- light / dark / system
  auto_sync      boolean      not null default true,            -- 앱 시작 시 자동 동기화
  chrome_profile varchar(50),                                   -- 마지막으로 고른 크롬 프로필
  last_synced_at timestamptz,
  created_at     timestamptz  not null default now(),
  updated_at     timestamptz  not null default now()
);

-- 북마크 그룹(탭). 크롬 폴더와는 chrome_folder_id로 매칭한다.
create table public.groups (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references public.profiles(id) on delete cascade,
  name             varchar(30) not null,
  position         integer     not null,
  chrome_folder_id varchar(50),                                 -- 동기화 매칭용
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- 한 사용자 안에서 그룹 이름은 겹치지 않는다
  constraint groups_user_id_name_key unique (user_id, name)
);

create table public.bookmarks (
  id              uuid             primary key,
  user_id         uuid             not null references public.profiles(id) on delete cascade,
  group_id        uuid             references public.groups(id) on delete set null,  -- NULL = 미분류
  title           varchar(100)     not null,
  url             text             not null,
  normalized_url  text             not null,                    -- 중복 검사용
  icon_url        text,                                         -- NULL이면 파비콘 서비스 사용
  source          varchar(15)      not null default 'manual',   -- manual / app_sync / ext_sync / html_import
  chrome_id       varchar(50),                                  -- 크롬 북마크 id
  tags            text[]           not null default '{}',       -- 최대 10개 (API에서 검증)
  is_pinned       boolean          not null default false,
  position        double precision not null,                    -- 사용자 지정 정렬 (중간값 삽입용 실수)
  click_count     integer          not null default 0,          -- 누적
  last_visited_at timestamptz,
  created_at      timestamptz      not null default now(),
  updated_at      timestamptz      not null default now(),
  -- javascript:, data: 같은 위험한 URL은 DB 단에서도 막는다 (API 검증이 뚫려도 마지막 방어선)
  constraint bookmarks_url_check check (url ~ '^https?://'),
  -- 같은 사용자가 같은 주소를 두 번 저장하지 못하게 한다 (409 DUPLICATE_URL의 근거)
  -- 이름은 docs/02-db.md 인덱스 표의 uq_bm_user_url과 맞춘다
  constraint uq_bm_user_url unique (user_id, normalized_url)
);

-- 크롬 북마크 id는 사용자 안에서 하나뿐이다. 단 직접 추가한 북마크는 chrome_id가 NULL이라 제외한다.
-- WHERE가 붙은 UNIQUE는 테이블 제약으로 쓸 수 없어 부분 유니크 인덱스로 만든다.
-- 이름은 docs/02-db.md 인덱스 표의 idx_bm_user_chrome과 맞춘다
create unique index idx_bm_user_chrome
  on public.bookmarks (user_id, chrome_id)
  where chrome_id is not null;

-- 방문 기록. '자주 방문순'(최근 30일)을 집계하는 데 쓴다. 90일 지난 로그는 삭제한다.
-- user_id는 RLS·집계용으로 복사해 두는 값이라 문서대로 FK를 걸지 않는다.
create table public.visit_logs (
  id          bigint      primary key generated always as identity,
  bookmark_id uuid        not null references public.bookmarks(id) on delete cascade,
  user_id     uuid        not null,
  visited_at  timestamptz not null default now()
);

-- 크롬 확장 전용 API 토큰. 원본은 저장하지 않고 SHA-256 해시만 둔다.
create table public.api_tokens (
  id           uuid        primary key,
  user_id      uuid        not null references public.profiles(id) on delete cascade,
  name         varchar(30) not null,
  token_hash   char(64)    not null,                            -- SHA-256 hex
  prefix       char(8)     not null,                            -- 목록 표시용
  last_used_at timestamptz,
  created_at   timestamptz not null default now(),
  -- 인증 시 해시로 한 건을 바로 찾는다. 이름은 docs/02-db.md 인덱스 표의 idx_tokens_hash와 맞춘다
  constraint idx_tokens_hash unique (token_hash)
);
