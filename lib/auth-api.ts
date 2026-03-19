import { createClient } from "@supabase/supabase-js"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function requireAuthNext(request: NextRequest): Promise<{ businessId: string } | NextResponse> {
  const token = request.headers.get("authorization")?.replace("Bearer ", "")
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = getSupabase()
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let business = await prisma.business.findUnique({ where: { userId: user.id } })
  if (!business) {
    business = await prisma.business.create({
      data: {
        id: user.id,
        userId: user.id,
        email: user.email,
        avatarUrl: user.user_metadata?.avatar_url ?? null,
        name: user.user_metadata?.full_name ?? "My Business",
        currency: "CAD",
        province: "AB",
      },
    })
  }

  return { businessId: business.id }
}

export async function updateOnboardedMetadata(userId: string) {
  const supabase = getSupabase()
  await supabase.auth.admin.updateUserById(userId, {
    user_metadata: { onboarded: true },
  })
}
