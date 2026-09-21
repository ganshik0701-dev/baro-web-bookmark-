import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
// 글꼴은 앱에 넣어 배포한다(docs/04-design.md). 쓰는 굵기만 불러온다
import '@fontsource/gowun-batang/700.css'
import '@fontsource/ibm-plex-sans-kr/400.css'
import '@fontsource/ibm-plex-sans-kr/500.css'
import '@fontsource/ibm-plex-sans-kr/600.css'
import './index.css'

// 6주차: TanStack Query의 QueryClientProvider로 감싼다
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
