import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

const PROTECTED = ["/", "/ledger", "/upload", "/gst", "/settings"]
const PUBLIC    = ["/login", "/auth", "/onboarding"]

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isProtected = PROTECTED.some(p => pathname === p || (p !== "/" && pathname.startsWith(p)))
  const isPublic    = PUBLIC.some(p => pathname.startsWith(p))

  if (!isProtected && !isPublic) return NextResponse.next()

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // No session → redirect to login for protected routes
  if (!user && isProtected) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  // Has session on login page → redirect to app
  if (user && pathname === "/login") {
    const onboarded = user.user_metadata?.onboarded === true
    return NextResponse.redirect(new URL(onboarded ? "/" : "/onboarding", request.url))
  }

  // Has session + not onboarded → redirect to onboarding (except already there)
  if (user && isProtected) {
    const onboarded = user.user_metadata?.onboarded === true
    if (!onboarded) {
      return NextResponse.redirect(new URL("/onboarding", request.url))
    }
  }

  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
