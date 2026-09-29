// SEARCH-05 정렬 저장 (docs/01-spec.md '정렬 규칙'). 한 번에 하나·마지막 값이 이긴다(use-latest-saver).
// 드롭다운을 방향키로 훑어도 요청이 몰리지 않는다.
import type { SortOption } from './order'
import { useLatestSaver } from './use-latest-saver'

/** onSaved(ok): 마지막 값의 저장이 끝났을 때 한 번(중간 값의 결과는 알리지 않는다) */
export function useSortSaver(onSaved: (ok: boolean) => void): (value: SortOption) => void {
  return useLatestSaver<SortOption>((v) => window.baro.saveSortOption(v), onSaved)
}
