import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const CategorySchema = z.object({
  name: z.string().min(1),
  type: z.enum(["INCOME", "EXPENSE", "BOTH"]),
  businessId: z.string().default("default-business"),
})

export async function GET(request: NextRequest) {
  try {
    const businessId = new URL(request.url).searchParams.get("businessId") || "default-business"
    const categories = await prisma.category.findMany({
      where: { businessId },
      orderBy: { name: "asc" },
    })
    return NextResponse.json({ categories })
  } catch (error) {
    console.error("GET /api/categories error:", error)
    return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = CategorySchema.parse(body)
    const category = await prisma.category.create({ data })
    return NextResponse.json({ category }, { status: 201 })
  } catch (error) {
    console.error("POST /api/categories error:", error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...data } = body
    const category = await prisma.category.update({
      where: { id },
      data: { name: data.name, type: data.type },
    })
    return NextResponse.json({ category })
  } catch (error) {
    console.error("PUT /api/categories error:", error)
    return NextResponse.json({ error: "Failed to update category" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = new URL(request.url).searchParams.get("id")
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })
    await prisma.category.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("DELETE /api/categories error:", error)
    return NextResponse.json({ error: "Failed to delete category" }, { status: 500 })
  }
}
