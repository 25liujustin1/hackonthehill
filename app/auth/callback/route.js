import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer.mjs'

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
      const email = data.user.email;
      
      // Check if email ends with a UCLA domain
      const isUCLA = email.endsWith('@ucla.edu') || email.endsWith('@g.ucla.edu');

      if (!isUCLA) {
        // If not UCLA, sign them back out immediately
        await supabase.auth.signOut();
        // Redirect to a specialized error page or the login page with a message
        return NextResponse.redirect(`${origin}/login?error=Only UCLA emails are allowed`);
      }
    }
  }

  return NextResponse.redirect(`${origin}/`)
}