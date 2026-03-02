'use client'

import { createClient } from '@/lib/supabaseClient'

export default function LoginPage() {
  const supabase = createClient()

async function signIn() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${location.origin}/auth/callback`,
        // This hints to Google to only show UCLA accounts
        queryParams: {
          hd: 'g.ucla.edu', 
        },
      },
    })
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Login</h1>
      <button onClick={signIn}>Login with UCLA</button>
    </main>
  )
}