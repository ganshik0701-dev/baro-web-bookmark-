-- 004_functions.sql
-- 트리거 2개와 함수 1개를 만든다.
--   on_auth_user_created : 첫 로그인(auth.users에 행 생성) 때 profiles 행을 자동으로 만든다
--   set_updated_at       : UPDATE 때 updated_at을 지금 시각으로 바꾼다
--   record_visit()       : 방문 1회를 기록한다 (click_count, last_visited_at, visit_logs를 한 번에)
--
-- security definer 함수는 만든 사람(postgres) 권한으로 돌아 RLS를 건너뛴다.
-- 그래서 search_path를 ''로 비우고 모든 이름을 public.·auth.로 적는다.
-- 누군가 다른 스키마에 같은 이름의 테이블을 만들어 함수를 속이는 것을 막기 위해서다.

-- ─── on_auth_user_created ─────────────────────────────────
-- Google 로그인 메타데이터(raw_user_meta_data)에서 이름·사진을 복사한다.
-- Google은 이름을 full_name 또는 name, 사진을 avatar_url 또는 picture로 준다.
-- display_name은 varchar(50)이라 긴 이름은 50자로 자른다 (넘치면 로그인 자체가 실패하므로).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    left(coalesce(new.raw_user_meta_data ->> 'full_name',
                  new.raw_user_meta_data ->> 'name'), 50),
    coalesce(new.raw_user_meta_data ->> 'avatar_url',
             new.raw_user_meta_data ->> 'picture')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── set_updated_at ───────────────────────────────────────
-- updated_at 컬럼이 있는 테이블(profiles, groups, bookmarks)에만 건다.
-- visit_logs, api_tokens는 문서상 updated_at이 없다.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger set_updated_at
  before update on public.groups
  for each row execute function public.set_updated_at();

create trigger set_updated_at
  before update on public.bookmarks
  for each row execute function public.set_updated_at();

-- ─── record_visit ─────────────────────────────────────────
-- POST /bookmarks/:id/visit 이 부른다. 함수 하나는 한 트랜잭션이라
-- 카운트 증가와 로그 삽입이 둘 다 되거나 둘 다 안 된다.
-- 내 북마크가 아니거나 없는 id면 update가 0건이므로 로그도 넣지 않고 조용히 끝난다.
-- (auth.uid()로 주인을 확인하므로 사용자 토큰으로 호출해야 한다. 서비스 키로 부르면 아무것도 안 한다)
create or replace function public.record_visit(p_bookmark_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  update public.bookmarks
     set click_count     = click_count + 1,
         last_visited_at = now()
   where id = p_bookmark_id
     and user_id = auth.uid()
  returning user_id into v_user_id;

  if v_user_id is not null then
    insert into public.visit_logs (bookmark_id, user_id)
    values (p_bookmark_id, v_user_id);
  end if;
end;
$$;

-- Postgres는 새 함수에 PUBLIC 실행 권한을 기본으로 준다. 로그인한 사용자만 부르게 좁힌다.
revoke execute on function public.record_visit(uuid) from public, anon;
grant  execute on function public.record_visit(uuid) to authenticated;
