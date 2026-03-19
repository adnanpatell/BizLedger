import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { requireAuthNext, updateOnboardedMetadata } from "@/lib/auth-api"

const OnboardSchema = z.object({
  name: z.string().min(1),
  taxNumber: z.string().optional().nullable(),
  currency: z.string().default("CAD"),
  province: z.string().default("AB"),
  city: z.string().optional().nullable(),
  country: z.string().default("CA"),
})

export async function POST(request: NextRequest) {
  const auth = await requireAuthNext(request)
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const data = OnboardSchema.parse(body)

    const business = await prisma.business.update({
      where: { id: auth.businessId },
      data: { ...data, onboarded: true },
    })

    // Update Supabase user_metadata so middleware reads onboarded without a DB call
    const biz = await prisma.business.findUnique({ where: { id: auth.businessId } })
    if (biz?.userId) {
      await updateOnboardedMetadata(biz.userId).catch(console.error)
    }

    return NextResponse.json({ business })
  } catch (error) {
    console.error("POST /api/business/onboard error:", error)
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues }, { status: 400 })
    return NextResponse.json({ error: "Onboarding failed" }, { status: 500 })
  }
}
