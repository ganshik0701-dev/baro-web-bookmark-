-- 02_rls_setup.sql
-- RLS 확인용 테스트 사용자 2명(A, B)과 북마크를 만든다. (A 2개, B 1개)
-- auth.users에 넣으면 on_auth_user_created 트리거가 profiles를 자동으로 만든다. 그것도 함께 확인한다.
-- 지울 때는 05_cleanup.sql을 실행한다.
--
-- SQL 에디터는 postgres 역할로 돈다. postgres는 테이블 주인이라 RLS를 받지 않고 모든 행을 본다.
-- 그래서 여기서는 A·B 데이터가 둘 다 보이는 게 정상이다. 격리 확인은 03에서 역할을 바꿔서 한다.
--
-- 볼 것: 결과 2줄
--   A | rls-test-a@example.com | 테스트 A | 북마크 2
--   B | rls-test-b@example.com | 테스트 B | 북마크 1

-- 고정 id를 쓰는 이유: 03~05에서 같은 사용자를 가리켜야 하기 때문
--   A = 00000000-0000-4000-a000-00000000000a
--   B = 00000000-0000-4000-a000-00000000000b

insert into auth.users (id, aud, role, email, raw_user_meta_data)
values
  ('00000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated',
   'rls-test-a@example.com', '{"full_name": "테스트 A", "avatar_url": "https://example.com/a.png"}'),
  ('00000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated',
   'rls-test-b@example.com', '{"full_name": "테스트 B", "avatar_url": "https://example.com/b.png"}');

-- 문서상 bookmarks.id에 기본값이 없어 id를 직접 넣는다
insert into public.bookmarks (id, user_id, title, url, normalized_url, position)
values
  ('00000000-0000-4000-b000-0000000000a1', '00000000-0000-4000-a000-00000000000a',
   'A의 네이버', 'https://www.naver.com/', 'naver.com', 1),
  ('00000000-0000-4000-b000-0000000000a2', '00000000-0000-4000-a000-00000000000a',
   'A의 깃허브', 'https://github.com/', 'github.com', 2),
  ('00000000-0000-4000-b000-0000000000b1', '00000000-0000-4000-a000-00000000000b',
   'B의 비밀 북마크', 'https://example.com/secret', 'example.com/secret', 1);

select case p.id when '00000000-0000-4000-a000-00000000000a' then 'A' else 'B' end as 사용자,
       p.email, p.display_name,
       (select count(*) from public.bookmarks b where b.user_id = p.id) as 북마크
  from public.profiles p
 where p.id in ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000b')
 order by 1;
