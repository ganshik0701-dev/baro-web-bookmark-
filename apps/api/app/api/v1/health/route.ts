import { NextResponse } from 'next/server'

// 1주차 확인용. 배포가 살아 있는지, 앱의 메인 프로세스에서 호출되는지만 본다.
export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json({
    data: {
      status: 'ok',
      time: new Date().toISOString(),
      version: process.env.npm_package_version ?? '0.1.0'
    }
  })
}
