// AUTH-02: 리프레시 토큰 저장소. safeStorage(Windows DPAPI)로 암호화해 userData/session.bin에 둔다.
// 같은 Windows 계정으로만 복호화된다. 평문은 디스크에 남기지 않고, 토큰 값은 로그에 찍지 않는다.
// 암호화를 못 쓰는 환경이면 아무것도 저장하지 않는다(호출한 쪽은 메모리만 쓴다).
import { app, safeStorage } from 'electron'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const filePath = (): string => join(app.getPath('userData'), 'session.bin')

/** app ready 이후에만 정확하다 */
export function canPersist(): boolean {
  return safeStorage.isEncryptionAvailable()
}

/** 저장된 토큰. 파일이 없거나, 암호화를 못 쓰거나, 복호화에 실패하면 null */
export async function loadRefreshToken(): Promise<string | null> {
  if (!canPersist()) return null
  let encrypted: Buffer
  try {
    encrypted = await readFile(filePath())
  } catch {
    return null
  }
  try {
    const parsed = JSON.parse(safeStorage.decryptString(encrypted)) as { refreshToken?: unknown }
    if (typeof parsed.refreshToken === 'string' && parsed.refreshToken) return parsed.refreshToken
  } catch {
    // 다른 Windows 계정에서 만든 파일이거나 손상된 파일. 다시 쓸 수 없으므로 아래에서 지운다
  }
  console.warn('[auth] 저장된 세션 파일을 읽지 못해 삭제합니다')
  await clearRefreshToken()
  return null
}

/** 저장했으면 true. 암호화를 못 쓰거나 쓰기에 실패하면 false(메모리만 쓴다) */
export async function saveRefreshToken(refreshToken: string): Promise<boolean> {
  if (!canPersist()) return false
  try {
    // 임시 파일에 쓰고 이름을 바꾼다. 쓰는 도중 앱이 꺼져도 기존 파일이 반쯤 덮이지 않는다
    const tmp = `${filePath()}.tmp`
    await writeFile(tmp, safeStorage.encryptString(JSON.stringify({ refreshToken })))
    await rename(tmp, filePath())
    return true
  } catch (err) {
    console.error('[auth] 세션 저장 실패:', err instanceof Error ? err.message : String(err))
    return false
  }
}

export async function clearRefreshToken(): Promise<void> {
  await rm(filePath(), { force: true })
}
