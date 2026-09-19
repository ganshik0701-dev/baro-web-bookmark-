-- 03_rls_check.sql
-- A로 로그인한 것처럼 역할을 바꿔서, B의 데이터가 안 보이고 건드려지지도 않는지 확인한다.
-- 02_rls_setup.sql을 먼저 실행해야 한다.
--
-- 로그인 흉내 내는 법
--   set local role authenticated              → 앱 사용자가 쓰는 역할로 바꾼다 (RLS 적용 대상)
--   request.jwt.claims 의 sub = A의 id        → auth.uid()가 A를 돌려주게 된다
--   둘 다 local이라 commit 하는 순간 원래 postgres로 돌아온다
--
-- SQL 에디터는 마지막 문장의 결과만 보여준다. 그래서 중간 결과를 임시 테이블에 모았다가
-- 맨 끝에서 한 번에 보여준다. 임시 테이블은 이 연결에만 있고 저장되지 않는다.
--
-- 볼 것: '통과' 열이 전부 true (8줄)

drop table if exists rls_result;
create temp table rls_result (순서 int, 세션 text, 항목 text, 기대 text, 실제 text);
grant all on rls_result to authenticated, anon;  -- 역할을 바꾼 뒤에도 결과를 적을 수 있게

begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a000-00000000000a", "role": "authenticated"}', true);

-- 1. A에게 보이는 북마크는 자기 것 2개뿐이어야 한다
insert into rls_result
select 1, 'A', '보이는 북마크 수', '2', count(*)::text from public.bookmarks;

-- 2. B의 id를 콕 집어 조회해도 0건 (없는 것처럼 보인다. 에러가 아니다)
insert into rls_result
select 2, 'A', 'B의 북마크를 직접 조회', '0', count(*)::text
  from public.bookmarks where user_id = '00000000-0000-4000-a000-00000000000b';

-- 3. profiles도 자기 것 1개만
insert into rls_result
select 3, 'A', '보이는 profiles 수', '1', count(*)::text from public.profiles;

-- 4. B의 북마크 제목을 바꾸려 해도 0건 수정 (USING이 B의 행을 걸러낸다)
with u as (
  update public.bookmarks set title = '해킹됨'
   where user_id = '00000000-0000-4000-a000-00000000000b'
  returning 1
)
insert into rls_result select 4, 'A', 'B의 북마크 UPDATE', '0건', count(*) || '건' from u;

-- 5. B의 북마크를 지우려 해도 0건 삭제
with d as (
  delete from public.bookmarks
   where user_id = '00000000-0000-4000-a000-00000000000b'
  returning 1
)
insert into rls_result select 5, 'A', 'B의 북마크 DELETE', '0건', count(*) || '건' from d;

-- 6. B의 이름(user_id)으로 북마크를 넣으려 하면 WITH CHECK에 걸려 에러가 나야 한다
--    에러가 나면 트랜잭션 전체가 깨지므로, 작은 블록 안에서 에러를 잡아 결과만 기록한다
do $$
begin
  begin
    insert into public.bookmarks (id, user_id, title, url, normalized_url, position)
    values ('00000000-0000-4000-b000-0000000000c1', '00000000-0000-4000-a000-00000000000b',
            '끼워넣기', 'https://evil.example.com/', 'evil.example.com', 9);
    insert into rls_result values (6, 'A', 'B 이름으로 INSERT', '거부됨', '허용됨 (문제!)');
  exception when insufficient_privilege then  -- RLS 위반은 42501 insufficient_privilege
    insert into rls_result values (6, 'A', 'B 이름으로 INSERT', '거부됨', '거부됨');
  end;
end $$;

-- 7. 반대로 B로 바꿔서 B는 자기 것 1개만 보는지
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a000-00000000000b", "role": "authenticated"}', true);
insert into rls_result
select 7, 'B', '보이는 북마크 수', '1', count(*)::text from public.bookmarks;

-- 8. 로그인하지 않은 사용자(anon)는 아무것도 못 본다
set local role anon;
insert into rls_result
select 8, 'anon', '보이는 북마크 수', '0', count(*)::text from public.bookmarks;

commit;

-- 여기부터 다시 postgres. B의 북마크가 그대로인지는 03 결과 뒤 04·05에서도 볼 수 있다
select 순서, 세션, 항목, 기대, 실제, 기대 = 실제 as 통과
  from rls_result
 order by 순서;
