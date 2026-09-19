-- 05_cleanup.sql
-- 02~04에서 만든 테스트 데이터를 전부 지운다.
-- auth.users에서 지우면 FK의 on delete cascade로
--   auth.users → profiles → groups·bookmarks·api_tokens → visit_logs
-- 순서로 딸린 행이 모두 따라 지워진다. 그래서 한 줄이면 된다.
--
-- 볼 것: 결과 1줄, 모든 열이 0

delete from auth.users
 where id in ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000b');

select
  (select count(*) from auth.users        where id in ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000b')) as auth_users,
  (select count(*) from public.profiles   where id in ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000b')) as profiles,
  (select count(*) from public.bookmarks  where user_id in ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000b')) as bookmarks,
  (select count(*) from public.visit_logs where user_id in ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000b')) as visit_logs;
