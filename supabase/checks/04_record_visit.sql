-- 04_record_visit.sql
-- record_visit가 click_count 증가, last_visited_at 갱신, visit_logs 삽입을 함께 하는지 확인한다.
-- 02_rls_setup.sql을 먼저 실행해야 한다. 여러 번 실행해도 된다 (전후 차이만 본다).
--
-- 확인 방법
--   실행 전 값을 적어 두고 → A로 record_visit를 2번 → 실행 후 값과 비교한다.
--   B가 A의 북마크로 record_visit를 불러도 아무 변화가 없어야 한다.
--   "동시에"의 증거: 함수 안의 now()는 트랜잭션 시작 시각이라,
--   같은 호출에서 쓴 last_visited_at과 visit_logs.visited_at이 정확히 같은 값이 된다.
--
-- 볼 것: '통과' 열이 전부 true (4줄)

drop table if exists visit_before;
create temp table visit_before as
select (select click_count from public.bookmarks
         where id = '00000000-0000-4000-b000-0000000000a1') as clicks,
       (select count(*) from public.visit_logs
         where bookmark_id = '00000000-0000-4000-b000-0000000000a1') as logs;

-- A로 로그인한 것처럼 자기 북마크를 2번 방문
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a000-00000000000a", "role": "authenticated"}', true);
select public.record_visit('00000000-0000-4000-b000-0000000000a1');
select public.record_visit('00000000-0000-4000-b000-0000000000a1');
commit;

-- B로 로그인한 것처럼 A의 북마크를 방문 → 아무 일도 없어야 한다
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a000-00000000000b", "role": "authenticated"}', true);
select public.record_visit('00000000-0000-4000-b000-0000000000a1');
commit;

with
b as (select * from visit_before),
a as (
  select bm.click_count as clicks,
         bm.last_visited_at,
         (select count(*) from public.visit_logs v
           where v.bookmark_id = bm.id) as logs,
         (select max(v.visited_at) from public.visit_logs v
           where v.bookmark_id = bm.id) as last_log_at,
         (select count(*) from public.visit_logs v
           where v.bookmark_id = bm.id
             and v.user_id <> bm.user_id) as foreign_logs
    from public.bookmarks bm
   where bm.id = '00000000-0000-4000-b000-0000000000a1'
),
r as (
            select 1 as 순서, 'click_count 증가량 (A 2번 + B 0번)' as 항목, '2' as 기대,
                   (a.clicks - b.clicks)::text as 실제 from a, b
  union all select 2, 'visit_logs 증가량', '2',
                   (a.logs - b.logs)::text from a, b
  union all select 3, 'last_visited_at = 마지막 로그 visited_at (같은 트랜잭션)', 'true',
                   (a.last_visited_at = a.last_log_at)::text from a
  union all select 4, '다른 사용자 이름으로 남은 로그', '0',
                   a.foreign_logs::text from a
)
select 순서, 항목, 기대, 실제, 기대 = 실제 as 통과
  from r
 order by 순서;
