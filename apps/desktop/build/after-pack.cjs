// electron-builder afterPack: 압축(설치 파일 만들기) 전에 baro.exe의 Electron Fuses를 바꾼다.
// 설치본에서 Node 쪽 디버깅·코드 주입 통로를 닫는다(CLAUDE.md 'Electron 보안').
// 실행 스위치(--remote-debugging-port 등)는 앱 코드(src/main/launch-guard.ts)가 막는다.
// electron-builder 25에는 Fuses 설정 항목이 없어 @electron/fuses로 직접 바꾼다.
const { join } = require('node:path')
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return
  const exe = join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`)
  await flipFuses(exe, {
    version: FuseVersion.V1,
    // ELECTRON_RUN_AS_NODE=1로 baro.exe를 node처럼 쓰지 못하게
    [FuseV1Options.RunAsNode]: false,
    // --inspect·--inspect-brk로 메인 프로세스에 디버거를 붙이지 못하게
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    // NODE_OPTIONS(--require 등)로 코드를 끼워 넣지 못하게
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    // resources/app.asar만 읽는다. 옆에 app 폴더를 두어 바꿔치지 못하게
    [FuseV1Options.OnlyLoadAppFromAsar]: true
  })
}
