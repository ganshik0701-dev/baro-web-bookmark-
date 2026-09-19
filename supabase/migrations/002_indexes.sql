-- 002_indexes.sql
-- docs/02-db.md 인덱스 표의 10개 중 조회 성능용 7개를 만든다.
-- 나머지 3개는 중복을 막는 무결성 제약이라 테이블과 함께 001_init.sql에서 만들었다.
--   uq_bm_user_url      UNIQUE bookmarks(user_id, normalized_url)              → 001 (제약)
--   idx_bm_user_chrome  UNIQUE bookmarks(user_id, chrome_id) WHERE NOT NULL    → 001 (부분 유니크 인덱스)
--   idx_tokens_hash     UNIQUE api_tokens(token_hash)                          → 001 (제약)
-- 같은 인덱스를 두 번 만들면 쓰기만 느려지므로 여기서 다시 만들지 않는다.

-- 정렬: 최신 추가순(created_desc, 기본값)
create index idx_bm_user_created
  on public.bookmarks (user_id, created_at desc);

-- 정렬: 최근 방문순(visited_desc). 한 번도 안 연 북마크(NULL)는 맨 뒤
create index idx_bm_user_visited
  on public.bookmarks (user_id, last_visited_at desc nulls last);

-- 정렬: 사용자 지정(custom). 그룹 탭별로 position 순서대로 읽는다
create index idx_bm_user_position
  on public.bookmarks (user_id, group_id, position);

-- 태그 필터(tags @> '{태그}'). 배열 안의 값을 찾는 데는 GIN이 맞다
create index idx_bm_tags
  on public.bookmarks using gin (tags);

-- 자주 방문순(visits_30d): 북마크별 최근 30일 방문 수 집계
create index idx_visit_recent
  on public.visit_logs (bookmark_id, visited_at desc);

-- 90일 지난 로그 삭제 작업
create index idx_visit_cleanup
  on public.visit_logs (visited_at);

-- 그룹 탭 목록을 순서대로 읽는다
create index idx_groups_user
  on public.groups (user_id, position);
