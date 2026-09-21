import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // 개발 모드에서 React의 추가 검사를 켠다 (프로덕션 동작에는 영향 없음)
  reactStrictMode: true,
  // packages/shared는 빌드 없이 TS 소스를 내보내므로 Next가 직접 트랜스파일하게 한다
  transpilePackages: ['@baro/shared', '@baro/db'],
  // ESLint는 아직 설정하지 않았다. 린트를 붙이면 이 줄을 지운다
  eslint: { ignoreDuringBuilds: true },
}

export default nextConfig
