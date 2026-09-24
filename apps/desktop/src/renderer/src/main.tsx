import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { queryClient } from './lib/queries'
// 글꼴은 앱에 넣어 배포한다(docs/04-design.md). 쓰는 굵기만 불러온다
import '@fontsource/gowun-batang/700.css'
import '@fontsource/ibm-plex-sans-kr/400.css'
import '@fontsource/ibm-plex-sans-kr/500.css'
import '@fontsource/ibm-plex-sans-kr/600.css'
import './index.css'

// 북마크 목록 캐시(TanStack Query). 설정은 lib/queries.ts
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
