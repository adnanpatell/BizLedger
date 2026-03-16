import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const BusinessSchema = z.object({
  name: z.string().min(1),
  taxNumber: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  currency: z.string().default("CAD"),
  province: z.string().default("AB"),
})

export async function GET() {
  try {
    let business = await prisma.business.findFirst({
      where: { id: "default-business" },
    })
    if (!business) {
      business = await prisma.business.create({
        data: { id: "default-business", name: "My Business", currency: "CAD", province: "AB" },
      })
    }
    return NextResponse.json({ business })
  } catch (error) {
    console.error("GET /api/business error:", error)
    return NextResponse.json({ error: "Failed to fetch business" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const data = BusinessSchema.parse(body)
    const business = await prisma.business.upsert({
      where: { id: "default-business" },
      update: data,
      create: { id: "default-business", ...data },
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
