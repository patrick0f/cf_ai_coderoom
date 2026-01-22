import { useState, useEffect } from 'react'

function App() {
  const [health, setHealth] = useState<string>('checking...')

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => setHealth(data.status || 'ok'))
      .catch(() => setHealth('worker not running'))
  }, [])

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>🏠 CodeRoom</h1>
      <p>AI Pair Programmer - Phase 0 Complete</p>
      <hr />
      <p>
        <strong>Worker Status:</strong> {health}
      </p>
      <p style={{ color: '#666', marginTop: '2rem' }}>
        Next: Phase 1 - Cloudflare scaffolding
      </p>
    </div>
  )
}

export default App
