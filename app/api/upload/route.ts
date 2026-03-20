import { NextRequest, NextResponse } from "next/server"
import { extname } from "path"
import { randomUUID } from "crypto"
import { requireAuthNext } from "@/lib/auth-api"
import { InvoiceExtractor } from "@/lib/invoice-extractor"

const MAX_SIZE = parseInt(process.env.MAX_FILE_SIZE_MB || "10") * 1024 * 1024

// ── File storage ───────────────────────────────────────────────────────────

async function saveUploadedFile(
  buffer: Buffer,
  fileName: string,
  fileType: string,
  year: number,
  mon: string,
): Promise<string> {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob")
    const blob = await put(`invoices/${year}/${mon}/${fileName}`, buffer, {
      access: "public",
      contentType: fileType,
    })
    return blob.url
  }

  const { writeFile, mkdir } = await import("fs/promises")
  const { join } = await import("path")
  const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads"
  const uploadPath = join(process.cwd(), UPLOAD_DIR, String(year), mon)
  await mkdir(uploadPath, { recursive: true })
  await writeFile(join(uploadPath, fileName), buffer)
  return `${UPLOAD_DIR}/${year}/${mon}/${fileName}`
}

// ── Text extraction ────────────────────────────────────────────────────────

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    // pdf-parse v2 API: class-based, takes { data: Buffer } in constructor
    const { PDFParse } = await import("pdf-parse")
    const parser = new PDFParse({ data: buffer })
    const result = await parser.getText()
    const text = result.text || ""

    // If text layer is thin (<50 chars), treat as image-based PDF → OCR each page
    if (text.trim().length < 50) {
      console.log("[upload] PDF has no/thin text layer — rendering pages for OCR")
      const screenshots = await parser.getScreenshot({ imageBuffer: true, scale: 3 })
      if (!screenshots.pages.length) return text

      const { createWorker } = await import("tesseract.js")
      const worker = await createWorker("eng")
      const parts: string[] = []
      for (const page of screenshots.pages) {
        if (!page.data?.length) continue
        const { data: { text: pageText } } = await worker.recognize(Buffer.from(page.data))
        parts.push(pageText)
        console.log(`[upload] OCR page ${page.pageNumber}: ${pageText.trim().length} chars`)
      }
      await worker.terminate()
      return parts.join("\n\n")
    }

    return text
  } catch (e) {
    console.error("PDF extraction error:", e)
    return ""
  }
}

async function extractTextFromImage(buffer: Buffer): Promise<string> {
  try {
    const { createWorker } = await import("tesseract.js")
    const worker = await createWorker("eng")
    const { data: { text } } = await worker.recognize(buffer)
    await worker.terminate()
    return text
  } catch (error) {
    console.error("OCR error:", error)
    return ""
  }
}

// ── POST handler ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const auth = await requireAuthNext(request)
  if (auth instanceof NextResponse) return auth

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file)
      return NextResponse.json({ error: "No file provided" }, { status: 400 })

    const allowedTypes = ["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp"]
    if (!allowedTypes.includes(file.type))
      return NextResponse.json({ error: "Invalid file type. Accepted: PDF, JPG, PNG, WEBP" }, { status: 400 })

    if (file.size > MAX_SIZE)
      return NextResponse.json({ error: `File too large. Max ${process.env.MAX_FILE_SIZE_MB || 10}MB` }, { status: 400 })

    const now      = new Date()
    const year     = now.getFullYear()
    const mon      = String(now.getMonth() + 1).padStart(2, "0")
    const ext      = extname(file.name)
    const fileName = `${randomUUID()}${ext}`

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const storedPath = await saveUploadedFile(buffer, fileName, file.type, year, mon)

    // ── Phase 1: text extraction ──────────────────────────────────────────
    let rawText = ""
    console.log(`[upload] phase1: extracting text from ${file.type} (${file.size} bytes, name="${file.name}")`)
    if (file.type === "application/pdf") {
      rawText = await extractTextFromPDF(buffer)
      console.log(`[upload] pdf extracted: ${rawText.trim().length} chars`)
    console.log("[upload] rawText:\n" + rawText)
      if (rawText.trim().length < 20)
        console.warn("[upload] PDF text extraction returned little content; file may be image-based.")
    } else {
      rawText = await extractTextFromImage(buffer)
      console.log(`[upload] ocr extracted: ${rawText.trim().length} chars`)
    }

    // ── Phase 2-4: proximity scoring + checksum validation ────────────────
    let extractedData = null
    let extractionError = null

    if (rawText.trim().length > 5) {
      try {
        console.log(`[upload] phase2-4: running InvoiceExtractor`)
        extractedData = new InvoiceExtractor(rawText).extract()
        console.log(`[upload] extraction done: company="${extractedData.company_name}" total=${extractedData.total_amount} confidence=${extractedData.confidence} needsReview=${extractedData.needs_review}`)
        if (!extractedData.company_name && !extractedData.total_amount && !extractedData.subtotal) {
          extractionError = "Could not parse invoice details — please fill in manually."
          console.warn("[upload] extraction produced no useful fields")
        }
      } catch (err) {
        console.error("[upload] Extraction error:", err)
        extractionError = "Parsing failed. Please enter data manually."
      }
    } else {
      extractionError = "Could not extract text from file. Please enter data manually."
      console.warn(`[upload] rawText too short (${rawText.trim().length} chars) — skipping extraction`)
    }

    return NextResponse.json({
      success: true,
      file: {
        fileName,
        originalName: file.name,
        filePath: storedPath,
        fileType: file.type,
        fileSize: file.size,
        extractedText: rawText,
      },
      extractedData,
      extractionError,
    })
  } catch (error) {
    console.error("POST /api/upload error:", error)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
