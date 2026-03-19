import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { requireAuthNext } from "@/lib/auth-api"

const AttachmentSchema = z.object({
  fileName: z.string(),
  originalName: z.string(),
  filePath: z.string(),
  fileType: z.string(),
  fileSize: z.number(),
  extractedText: z.string().optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuthNext(request)
  if (auth instanceof NextResponse) return auth

  try {
    const { id } = await params
    const body = await request.json()
    const data = AttachmentSchema.parse(body)

    const transaction = await prisma.transaction.findUnique({ where: { id, businessId: auth.businessId } })
    if (!transaction)
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 })

    const attachment = await prisma.attachment.create({
      data: {
        fileName: data.fileName,
        originalName: data.originalName,
        filePath: data.filePath,
        fileType: data.fileType,
        fileSize: data.fileSize,
        extractedText: data.extractedText ?? null,
        transactionId: id,
      },
    })

    return NextResponse.json({ attachment })
  } catch (error) {
    console.error("POST /api/transactions/[id]/attachments error:", error)
    if (error instanceof z.ZodError)
      return NextResponse.json({ error: error.issues }, { status: 400 })
    return NextResponse.json({ error: "Failed to save attachment" }, { status: 500 })
  }
}
