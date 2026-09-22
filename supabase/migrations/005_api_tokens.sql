-- 005_api_tokens.sql
-- 확장 토큰(EXT-01)용: 토큰 해시 → 사용자 조회 함수, 그 함수만 부를 수 있는 역할, 사용자당 5개 제한 트리거.
-- 설계는 docs/02-db.md 'RLS·트리거·함수', docs/03-api.md '/tokens'.

-- ─── 조회 전용 역할과 private 스키마 ─────────────────────
-- 확장 요청은 처음엔 누구인지 몰라 RLS(user_id = auth.uid())로 토큰을 찾을 수 없다.
-- 그렇다고 API가 소유자(postgres) 권한으로 조회하면 그 트랜잭션은 RLS를 건너뛴다.
-- 그래서 아무 테이블 권한도 없고 아래 함수 하나만 부를 수 있는 역할을 따로 둔다.
-- anon·authenticated가 아니고 authenticator에도 붙이지 않으므로 REST API(PostgREST)로는 쓸 수 없다.
create role baro_token_resolver nologin;
-- API 연결 계정(postgres)이 트랜잭션 안에서 SET LOCAL ROLE로 이 역할로 바꿀 수 있게 한다
grant baro_token_resolver to postgres;

-- REST API는 public 스키마만 노출한다. 사용자가 직접 부르면 안 되는 함수는 여기에 둔다
create schema private;
revoke all on schema private from public;
grant usage on schema private to baro_token_resolver;

-- ─── resolve_api_token ────────────────────────────────────
-- 해시가 맞는 토큰의 user_id 하나만 돌려준다(없거나 폐기됐으면 null). 토큰 id·이름·해시는 내보내지 않는다.
-- - 인자는 char(64): 컬럼(token_hash char(64))과 타입이 같아야 idx_tokens_hash를 쓴다.
--   text로 받으면 컬럼 쪽이 ::text로 바뀌어 전체 스캔이 된다(EXPLAIN으로 확인)
-- - security definer: 소유자 권한으로 api_tokens를 읽는다. search_path를 비워 두고 모든 이름에 스키마를 붙여,
--   부르는 쪽이 search_path에 가짜 테이블·함수를 끼워 넣어도 영향이 없게 한다
-- - last_used_at은 마지막 값이 5분보다 오래됐을 때만 쓴다. 확장이 연달아 요청해도 같은 행에 쓰기가 몰리지 않는다
create function private.resolve_api_token(p_token_hash char(64))
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  select user_id into v_user_id
    from public.api_tokens
   where token_hash = p_token_hash;

  if v_user_id is not null then
    update public.api_tokens
       set last_used_at = now()
     where token_hash = p_token_hash
       and (last_used_at is null or last_used_at < now() - interval '5 minutes');
  end if;

  return v_user_id;
end;
$$;

-- Postgres는 새 함수에 PUBLIC 실행 권한을 기본으로 주고, Supabase는 anon·authenticated·service_role에도 준다.
-- 모두 회수하고 조회 전용 역할에만 준다
revoke all on function private.resolve_api_token(char) from public, anon, authenticated, service_role;
grant execute on function private.resolve_api_token(char) to baro_token_resolver;

-- ─── enforce_api_token_limit ──────────────────────────────
-- 사용자당 토큰 5개. "세고 나서 넣기"는 동시 요청 두 개가 둘 다 4개를 보고 6개째를 만들 수 있다.
-- 그래서 먼저 그 사용자의 profiles 행을 FOR UPDATE로 잠근다. 같은 사용자의 발급은 여기서 줄을 서고,
-- 뒤 요청의 count는 앞 요청이 커밋한 뒤에 돌아 정확한 개수를 본다(READ COMMITTED는 문장마다 새로 본다).
-- 부르는 사용자 권한(invoker)으로 돈다: RLS로 자기 profiles를 잠그고(profiles_update_own) 자기 토큰만 센다.
-- API는 P0001 + 'TOKEN_LIMIT_EXCEEDED'를 409 TOKEN_LIMIT_EXCEEDED로 바꾼다
create function public.enforce_api_token_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from public.profiles where id = new.user_id for update;

  if (select count(*) from public.api_tokens where user_id = new.user_id) >= 5 then
    raise exception 'TOKEN_LIMIT_EXCEEDED' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- 트리거 함수는 사용자가 직접 부를 일이 없다(트리거로 도는 데는 EXECUTE 권한이 필요 없다)
revoke all on function public.enforce_api_token_limit() from public, anon, authenticated, service_role;

create trigger enforce_api_token_limit
  before insert on public.api_tokens
  for each row execute function public.enforce_api_token_limit();
