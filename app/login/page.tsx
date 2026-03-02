'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabaseClient'

function LoginContent() {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  async function signIn() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${location.origin}/auth/callback`,
        queryParams: { hd: 'g.ucla.edu' },
      },
    })
  }

  return (
    <main style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Space+Grotesk:wght@600;700&display=swap');`}</style>

      <div style={{ textAlign: 'center', maxWidth: 320, width: '90%', color: '#fff' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📦</div>
        <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
          UCLA Time Capsule
        </h1>
        <p style={{ color: '#666', fontSize: 13, lineHeight: 1.6, marginBottom: 24 }}>
          Leave photos and messages at real UCLA locations.
        </p>

        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 12,
            padding: '12px 16px',
            marginBottom: 20,
            textAlign: 'left',
          }}>
            <p style={{ color: '#ef4444', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              🚫 Access Denied
            </p>
            <p style={{ color: '#fca5a5', fontSize: 12, lineHeight: 1.5 }}>
              This app is only available to UCLA students and staff. Please sign in with a <strong>@ucla.edu</strong> or <strong>@g.ucla.edu</strong> email address.
            </p>
          </div>
        )}

        <button
          onClick={signIn}
          style={{
            width: '100%',
            background: 'linear-gradient(135deg,#f59e0b,#ef4444)',
            border: 'none',
            color: '#fff',
            fontWeight: 600,
            padding: '12px 0',
            borderRadius: 10,
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          Login with UCLA Google
        </button>

        <p style={{ color: '#333', fontSize: 11, marginTop: 16 }}>
          Only @ucla.edu and @g.ucla.edu accounts are permitted
        </p>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  )
}