import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { requireAuthNext } from "@/lib/auth-api"

const BusinessSchema = z.object({
  name: z.string().min(1),
  taxNumber: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  currency: z.string().default("CAD"),
  province: z.string().default("AB"),
  city: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
})

export async function GET(request: NextRequest) {
  const auth = await requireAuthNext(request)
  if (auth instanceof NextResponse) return auth

  try {
    const business = await prisma.business.findUnique({ where: { id: auth.businessId } })
    return NextResponse.json({ business })
  } catch (error) {
    console.error("GET /api/business error:", error)
    return NextResponse.json({ error: "Failed to fetch business" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuthNext(request)
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const data = BusinessSchema.parse(body)
    const business = await prisma.business.update({
      where: { id: auth.businessId },
      data,
    })
    return NextResponse.json({ business })
  } catch (error) {
    console.error("PUT /api/business error:", error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    return NextResponse.json({ error: "Failed to update business" }, { status: 500 })
  }
}
