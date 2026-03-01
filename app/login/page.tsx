'use client'

import { createClient } from '@/lib/supabaseClient'

export default function LoginPage() {
  const supabase = createClient()

  async function signIn() {
    // provider examples: 'google', 'github', etc.
    // UCLA SSO will be whatever provider you configure in Supabase (OIDC/SAML brokered as OIDC).
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${location.origin}/auth/callback`,
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