import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer.mjs'

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
      const email = data.user.email
      const isUCLA = email.endsWith('@ucla.edu') || email.endsWith('@g.ucla.edu')

      if (!isUCLA) {
        await supabase.auth.signOut()
        return NextResponse.redirect(`${origin}/login?error=Only UCLA emails are allowed`)
      }
    }
  }

  return NextResponse.redirect(`${origin}/`)
}