-- 006_sync.sql
-- 크롬 동기화(/sync/chrome)에 필요한 인덱스·제약. 설계는 docs/03-api.md '/sync/chrome', docs/02-db.md '동기화용 제약'.

-- 폴더 매칭: 요청의 폴더 chromeId → 그룹. 같은 크롬 폴더가 그룹 두 개가 되지 않게 유니크로 둔다
create unique index idx_groups_user_chrome
  on public.groups (user_id, chrome_folder_id)
  where chrome_folder_id is not null;

-- 그룹 이름 유니크를 DEFERRABLE INITIALLY IMMEDIATE로 다시 만든다. 크롬에서 폴더 이름을 맞바꾸는(A↔B) 경우 때문이다.
-- - 지금(DEFERRABLE 아님)은 한 행씩 즉시 검사해서, 한 문장 안의 맞바꿈도 중간에 실패한다
-- - DEFERRABLE INITIALLY IMMEDIATE는 문장 끝에 검사한다. 평소 동작(요청마다 바로 409)은 그대로다
-- - 동기화 트랜잭션은 여러 문장에 걸쳐 바꾸므로 SET CONSTRAINTS ... DEFERRED로 커밋 때 검사한다
-- ALTER CONSTRAINT ... DEFERRABLE은 PostgreSQL 17까지 외래 키에만 되므로(42809) 지우고 같은 이름으로 다시 만든다.
-- 한 ALTER TABLE 문이라 제약이 없는 순간이 밖에서 보이지 않는다
alter table public.groups
  drop constraint groups_user_id_name_key,
  add constraint groups_user_id_name_key unique (user_id, name) deferrable initially immediate;

-- source는 네 값만
alter table public.bookmarks
  add constraint bookmarks_source_check
  check (source in ('manual', 'app_sync', 'ext_sync', 'html_import'));

-- 동기화분(app_sync·ext_sync)만 chrome_id를 가진다.
-- full 동기화의 "요청에 없는 chrome_id 삭제, manual·html_import 유지" 규칙이 이 전제에 기댄다.
-- 코드 실수로 manual 행에 chrome_id가 붙으면 그 행이 삭제 대상이 될 수 있으므로 DB가 막는다
alter table public.bookmarks
  add constraint bookmarks_chrome_id_source_check
  check ((chrome_id is not null) = (source in ('app_sync', 'ext_sync')));
