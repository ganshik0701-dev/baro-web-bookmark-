// OPEN-03 보조 메뉴 항목과 렌더러 입력 검사 (docs/01-spec.md '열기와 보조 메뉴 규칙')
import { describe, expect, it } from 'vitest'
import { parseTileMenuInput, tileMenuItems } from '../src/main/tile-menu'

const labels = (items: ReturnType<typeof tileMenuItems>) =>
  items.map((i) => (i.kind === 'separator' ? '---' : i.kind === 'note' ? `(${i.label})` : `${i.label}${i.enabled ? '' : ' [비활성]'}`))

describe('tileMenuItems', () => {
  it('바로에서 추가한 것(manual): 고정·삭제 모두 가능', () => {
    expect(labels(tileMenuItems({ isPinned: false, source: 'manual' }))).toEqual(['고정', '---', '삭제'])
  })

  it('고정된 것은 "고정 해제"', () => {
    expect(labels(tileMenuItems({ isPinned: true, source: 'manual' }))[0]).toBe('고정 해제')
  })

  it.each(['app_sync', 'ext_sync'] as const)('크롬에서 온 것(%s): 삭제 비활성 + 이유 줄', (source) => {
    expect(labels(tileMenuItems({ isPinned: false, source }))).toEqual([
      '고정',
      '---',
      '삭제 [비활성]',
      '(크롬에서 지우면 다음 동기화 때 사라집니다)'
    ])
  })

  it('HTML 가져오기(html_import)는 동기화가 되살리지 않으므로 삭제 가능', () => {
    expect(labels(tileMenuItems({ isPinned: false, source: 'html_import' }))).toEqual(['고정', '---', '삭제'])
  })
})

describe('parseTileMenuInput', () => {
  it('올바른 입력, 좌표는 반올림', () => {
    expect(parseTileMenuInput({ isPinned: true, source: 'app_sync', x: 10.4, y: 20.6 })).toEqual({
      isPinned: true,
      source: 'app_sync',
      x: 10,
      y: 21
    })
  })

  it.each([
    [null],
    ['pin'],
    [{ isPinned: 'true', source: 'manual' }],
    [{ isPinned: true, source: 'hacked' }],
    [{ isPinned: true }]
  ])('모양이 다르면 null: %j', (raw) => {
    expect(parseTileMenuInput(raw)).toBeNull()
  })

  it('좌표가 숫자가 아니거나 음수면 무시(마우스 위치로 뜬다)', () => {
    expect(parseTileMenuInput({ isPinned: false, source: 'manual', x: -5, y: 'a' })).toEqual({
      isPinned: false,
      source: 'manual',
      x: undefined,
      y: undefined
    })
  })
})
