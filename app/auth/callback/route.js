// app/auth/callback/route.js

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer.mjs'

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient() // ✅ added await

    // This converts the OAuth "code" into a real session
    await supabase.auth.exchangeCodeForSession(code)
  }

  // After session is created, send user to homepage
  return NextResponse.redirect(`${origin}/`)
}