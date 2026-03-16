import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const BulkSchema = z.object({
  ids: z.array(z.string()).min(1),
  action: z.enum(["markPaid", "markPending", "markOverdue", "delete"]),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { ids, action } = BulkSchema.parse(body)

    if (action === "delete") {
      await prisma.transaction.deleteMany({ where: { id: { in: ids } } })
      return NextResponse.json({ success: true, affected: ids.length })
    }

    const statusMap: Record<string, "PAID" | "PENDING" | "OVERDUE"> = {
      markPaid: "PAID",
      markPending: "PENDING",
      markOverdue: "OVERDUE",
    }

    await prisma.transaction.updateMany({
      where: { id: { in: ids } },
      data: { paymentStatus: statusMap[action] },
    })

    return NextResponse.json({ success: true, affected: ids.length })
  } catch (error) {
    console.error("POST /api/transactions/bulk error:", error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    return NextResponse.json({ error: "Bulk operation failed" }, { status: 500 })
  }
}
