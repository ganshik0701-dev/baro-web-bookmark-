-- 007_rate_limits.sql
-- 속도 제한(사용자당 분당 120회, /metadata 20회, /sync/chrome 10회).
-- 설계는 docs/03-api.md '속도 제한', docs/02-db.md '속도 제한 (007)'.

-- ─── rate_limits ──────────────────────────────────────────
-- 고정 윈도: (사용자, 버킷, 분) 한 행에 그 분의 요청 수를 센다.
-- 기본키가 곧 upsert 키라 따로 인덱스를 만들지 않는다.
create table public.rate_limits (
  user_id      uuid        not null references public.profiles(id) on delete cascade,
  bucket       text        not null,
  window_start timestamptz not null,
  count        int         not null default 0,
  primary key (user_id, bucket, window_start)
);

-- 이 테이블은 아래 함수로만 읽고 쓴다. 정책을 두지 않아 사용자 권한으로는 아무 행도 보이지 않는다
-- (RLS를 켜고 정책이 없으면 전부 거절된다. 소유자와 security definer 함수는 영향받지 않는다)
alter table public.rate_limits enable row level security;

-- ─── 전용 역할 ────────────────────────────────────────────
-- 확장 토큰 조회(baro_token_resolver)와 같은 방식이다: 테이블 권한은 없고 함수 하나만 부를 수 있다.
-- 역할을 나눠 두면 한쪽 경로가 뚫려도 다른 쪽 함수는 부를 수 없다.
create role baro_rate_limiter nologin;
grant baro_rate_limiter to postgres;
grant usage on schema private to baro_rate_limiter;

-- ─── hit_rate_limit ───────────────────────────────────────
-- 버킷들을 한 번에 올리고 올린 뒤의 값을 돌려준다. 한도 값은 API가 갖고 있고 여기서는 세기만 한다
-- (한도를 바꾸려고 마이그레이션을 다시 하지 않아도 되게).
-- - security definer + search_path = '': 부르는 쪽이 search_path에 가짜 테이블을 끼워 넣어도 영향이 없다
-- - 오래된 행은 가끔(약 1%) 지운다. 매번 지우면 요청마다 delete가 붙고, 안 지우면 표가 계속 자란다.
--   본격적인 정리는 v1.1 '오래된 로그 정리 작업'에서
-- 돌려주는 컬럼 이름에 hit_를 붙인다. `bucket`·`count`로 두면 PL/pgSQL이 그것을 변수로 잡아
-- 쿼리 안의 같은 이름 컬럼과 충돌한다("column reference is ambiguous", 리허설에서 확인)
create function private.hit_rate_limit(p_user_id uuid, p_buckets text[])
returns table (hit_bucket text, hit_count int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := date_trunc('minute', now());
begin
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 hour';
  end if;

  return query
  insert into public.rate_limits as rl (user_id, bucket, window_start, count)
  select p_user_id, b, v_window, 1
    from unnest(p_buckets) as b
     on conflict (user_id, bucket, window_start)
     do update set count = rl.count + 1
  returning rl.bucket, rl.count;
end;
$$;

-- Postgres는 새 함수에 PUBLIC 실행 권한을 기본으로 주고, Supabase는 anon·authenticated·service_role에도 준다.
-- 모두 회수하고 전용 역할에만 준다
revoke all on function private.hit_rate_limit(uuid, text[]) from public, anon, authenticated, service_role;
grant execute on function private.hit_rate_limit(uuid, text[]) to baro_rate_limiter;
