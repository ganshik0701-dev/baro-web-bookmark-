export default function Page() {
  return (
    <main style={{ fontFamily: 'system-ui', padding: 40 }}>
      <h1>baro API</h1>
      <p>
        상태 확인: <a href="/api/v1/health">/api/v1/health</a>
      </p>
    </main>
  )
}
