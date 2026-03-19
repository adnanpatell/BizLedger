import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")

  if (code) {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      console.error("[auth/callback] exchangeCodeForSession error:", error.message, error)
    }

    if (!error && user) {
      const onboarded = user.user_metadata?.onboarded === true
      return NextResponse.redirect(new URL(onboarded ? "/" : "/onboarding", origin))
    }
  }

  return NextResponse.redirect(new URL("/login?error=auth_failed", origin))
}
