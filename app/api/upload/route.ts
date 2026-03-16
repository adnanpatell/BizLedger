import { NextRequest, NextResponse } from "next/server"
import { writeFile, mkdir } from "fs/promises"
import { join, extname } from "path"
import { randomUUID } from "crypto"

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads"
const MAX_SIZE = parseInt(process.env.MAX_FILE_SIZE_MB || "10") * 1024 * 1024

// ── Layer 1: Multi-Strategy Text Extraction ────────────────────────────────

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    // Use createRequire to load the CJS build directly, bypassing the ESM wrapper
    // and avoiding pdf-parse's test-file read bug in Next.js serverless
    const { createRequire } = await import("module")
    const req = createRequire(import.meta.url)
    const pdfParse = req("pdf-parse/dist/pdf-parse/cjs/index.cjs")
    const fn = typeof pdfParse === "function" ? pdfParse : pdfParse.default
    const data = await fn(buffer)
    return data.text || ""
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

// ── Layer 2: Keyword-Anchored Scoring Engine ───────────────────────────────
//
//  For each field: find anchor keywords → find candidate values nearby →
//  score = anchor_weight × proximity_factor + same_line_bonus →
//  pick highest-scoring candidate.
//
//  This degrades gracefully across diverse formats (receipts, packing lists,
//  structured invoices, phone bills) without format-specific regex.

// ── Types ──────────────────────────────────────────────────────────────────

interface TextLine {
  index: number
  text: string
  lower: string
}

interface ScoredCandidate {
  value: string
  score: number
  sourceLine: number
  anchor: string
}

type MoneyTuple = [number, number, number]    // [value, start, end]
type DateTuple  = [string, number, number]    // [YYYY-MM-DD, start, end]
type InvTuple   = [string, number, number]    // [token, start, end]

// Anchor: [matchText, weight]
type Anchor = [string, number]

// ── Text to lines ──────────────────────────────────────────────────────────

function toLines(raw: string): TextLine[] {
  return raw
    .split(/\r?\n/)
    .map((t, i) => ({ index: i, text: t.trim(), lower: t.trim().toLowerCase() }))
    .filter(l => l.text.length > 0)
}

// ── Value finders ──────────────────────────────────────────────────────────

function findMoneyValues(text: string): MoneyTuple[] {
  const results: MoneyTuple[] = []
  const seen = new Set<number>()

  // $1,234.56  |  1,234.56  |  $57.01
  const dollarPat = /\$?\s*(\d{1,3}(?:,\d{3})*\.\d{2})|\$\s*(\d+\.\d{2})/g
  let m: RegExpExecArray | null
  while ((m = dollarPat.exec(text)) !== null) {
    const raw = m[1] || m[2]
    if (!raw) continue
    const val = parseFloat(raw.replace(/,/g, ""))
    if (val > 0 && !seen.has(val)) {
      seen.add(val)
      results.push([val, m.index, m.index + m[0].length])
    }
  }
  // Bare decimals: "227.47"
  const barePat = /(?<!\d)(\d{1,6}\.\d{2})(?!\d)/g
  while ((m = barePat.exec(text)) !== null) {
    const val = parseFloat(m[1])
    if (val > 0 && !seen.has(val)) {
      seen.add(val)
      results.push([val, m.index, m.index + m[0].length])
    }
  }
  return results
}

const MONTH_MAP: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
}

function parseISO(y: string, m: string, d: string): string | null {
  const yi = parseInt(y), mi = parseInt(m), di = parseInt(d)
  if (yi >= 2000 && yi <= 2099 && mi >= 1 && mi <= 12 && di >= 1 && di <= 31)
    return `${yi}-${String(mi).padStart(2, "0")}-${String(di).padStart(2, "0")}`
  return null
}

function findDates(text: string): DateTuple[] {
  const results: DateTuple[] = []
  const seen = new Set<string>()
  const add = (d: string | null, s: number, e: number) => {
    if (d && !seen.has(d)) { seen.add(d); results.push([d, s, e]) }
  }

  // 2025/08/06  2025-9-15
  for (const m of text.matchAll(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/g))
    add(parseISO(m[1], m[2], m[3]), m.index!, m.index! + m[0].length)

  // 11/17/2025
  for (const m of text.matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g)) {
    const a = parseInt(m[1]), b = parseInt(m[2]), y = m[3]
    const [mo, da] = a > 12 ? [b, a] : [a, b]
    add(parseISO(y, String(mo), String(da)), m.index!, m.index! + m[0].length)
  }

  // Oct 24, 2025  |  October 24 2025
  for (const m of text.matchAll(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})[,\s]+(\d{4})\b/gi
  )) {
    const mo = MONTH_MAP[m[1].slice(0, 3).toLowerCase()]
    if (mo) add(parseISO(m[3], String(mo), m[2]), m.index!, m.index! + m[0].length)
  }

  // 24 Oct 2025
  for (const m of text.matchAll(
    /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{4})\b/gi
  )) {
    const mo = MONTH_MAP[m[2].slice(0, 3).toLowerCase()]
    if (mo) add(parseISO(m[3], String(mo), m[1]), m.index!, m.index! + m[0].length)
  }

  return results
}

const INV_PAT = /(?:#\s*)?(\d[\d\-\.\/A-Z]{1,25}\d)|(?:#\s*)([A-Z]{1,5}[\-\.]?\d{3,15})|(\d{4,15})/gi

function findInvoiceTokens(text: string): InvTuple[] {
  const results: InvTuple[] = []
  for (const m of text.matchAll(INV_PAT)) {
    const val = (m[1] || m[2] || m[3] || "").trim()
    if (val.length >= 3) results.push([val, m.index!, m.index! + m[0].length])
  }
  return results
}

// ── Core scoring algorithm ─────────────────────────────────────────────────

function scoreField<T extends [unknown, number, number]>(
  lines: TextLine[],
  anchors: Anchor[],
  extractor: (text: string) => T[],
  maxDist = 3,
): ScoredCandidate[] {
  const candidates: ScoredCandidate[] = []

  for (const line of lines) {
    for (const [anchorText, weight] of anchors) {
      const anchorPos = line.lower.indexOf(anchorText.toLowerCase())
      if (anchorPos === -1) continue

      for (const other of lines) {
        const dist = Math.abs(other.index - line.index)
        if (dist > maxDist) continue

        for (const [val, start] of extractor(other.text)) {
          const proximity = 1.0 / (1.0 + dist * 0.5)
          const sameLineBonus = (other.index === line.index && (start as number) > anchorPos) ? 3 : 0
          candidates.push({
            value: String(val),
            score: weight * proximity + sameLineBonus,
            sourceLine: other.index,
            anchor: anchorText,
          })
        }
      }
    }
  }

  return candidates.sort((a, b) => b.score - a.score)
}

// ── Anchor tables ──────────────────────────────────────────────────────────

const TOTAL_ANCHORS: Anchor[] = [
  ["grand total",    12],
  ["total due",      10],
  ["total amount",   10],
  ["amount due",      9],
  ["balance due",     9],
  ["total:",         10],
  ["total $",        10],
  ["fuel sale",       6],
  ["amt:",            7],
  ["cad ",            5],
]

const SUBTOTAL_ANCHORS: Anchor[] = [
  ["subtotal",             10],
  ["sub-total",            10],
  ["total w/o gst",        10],
  ["total without gst",    10],
  ["total before tax",     10],
  ["amount before tax",    10],
  ["taxable amount",        8],
]

const GST_ANCHORS: Anchor[] = [
  ["gst (5%)",       10],
  ["gst:",           10],
  ["gst included",    9],
  ["gst",             8],
  ["hst",             8],
  ["pst",             7],
]

const DATE_ANCHORS: Anchor[] = [
  ["invoice date",   12],
  ["inv date",       11],
  ["bill date",      10],
  ["date:",          10],
  ["date",            6],
  ["ship date",       4],
  ["due date",        3],
]

const INV_NUM_ANCHORS: Anchor[] = [
  ["invoice #",      12],
  ["invoice number", 12],
  ["invoice no",     12],
  ["inv #",          11],
  ["order number",    6],
  ["transaction#",    7],
  ["receipt #",       8],
  ["receipt no",      8],
  ["ref:",            4],
]

// ── Document type detection ────────────────────────────────────────────────

function detectDocumentType(lower: string): string {
  if (/packing\s+list|packing\s+slip/.test(lower))   return "packing_list"
  if (/transaction\s+record|customer\s+copy/.test(lower)) return "receipt"
  if (/purchase\s+order/.test(lower))                 return "purchase_order"
  if (/statement/.test(lower))                        return "statement"
  if (/quote|quotation|estimate/.test(lower))         return "quote"
  if (/invoice/.test(lower))                          return "invoice"
  return "unknown"
}

// ── Vendor / company detection ─────────────────────────────────────────────

interface VendorInfo {
  name: string
  phone: string
  email: string
  gstNumber: string
  address: string
}

// Known vendors: [regex, canonical name]
const KNOWN_VENDORS: [RegExp, string][] = [
  [/costco/i,                        "Costco"],
  [/swift\s+oilfield\s+supply/i,     "Swift Oilfield Supply Inc."],
  [/swift\s+supply/i,                "Swift Supply"],
  [/atco\s+gas/i,                    "ATCO Gas"],
  [/atco\s+electric/i,               "ATCO Electric"],
  [/\benmax\b/i,                     "ENMAX"],
  [/\bepcor\b/i,                     "EPCOR"],
  [/fortis(?:alberta|bc)/i,          "FortisAlberta"],
  [/shaw\s+(?:business|communications)/i, "Shaw Business"],
  [/\btelus\b/i,                     "TELUS"],
  [/rogers\s+(?:communications|wireless)/i, "Rogers Communications"],
  [/\bbell\s+canada\b/i,             "Bell Canada"],
  [/hydro\s+one/i,                   "Hydro One"],
  [/bc\s+hydro/i,                    "BC Hydro"],
  [/singlesource/i,                  "Singlesource Project Management Inc"],
  [/lembei/i,                        "LEMBEI BENEFIT APEGA"],
  [/petro[-\s]canada/i,              "Petro-Canada"],
  [/\bshell\b/i,                     "Shell"],
  [/\besso\b/i,                      "Esso"],
  [/amazon\s+web\s+services/i,       "Amazon Web Services"],
  [/microsoft\s+canada/i,            "Microsoft Canada"],
]

const SKIP_HEADER = new Set([
  "invoice", "packing list", "receipt", "transaction record",
  "statement", "bill", "cardholder copy", "your detailed invoice",
  "thank you for your business", "cash sale", "customer copy",
])

function detectVendor(lines: TextLine[], full: string): VendorInfo {
  const info: VendorInfo = { name: "", phone: "", email: "", gstNumber: "", address: "" }

  // Find where "Bill To / Ship To / Customer" section starts
  let billToIdx: number | null = null
  for (const l of lines) {
    if (/bill\s+to|sold\s+to|ship\s+to|customer|client\s+id/i.test(l.lower)) {
      billToIdx = l.index
      break
    }
  }

  // Try known vendors first (most reliable)
  for (const [re, name] of KNOWN_VENDORS) {
    if (re.test(full)) { info.name = name; break }
  }

  // Top-of-document heuristic (scan first 12 lines, stop at bill-to)
  if (!info.name) {
    for (const l of lines.slice(0, 12)) {
      if (billToIdx !== null && l.index >= billToIdx) break
      const clean = l.lower.replace(/[\d\s\-/.$,*#:]+/g, " ").trim()
      if (SKIP_HEADER.has(clean)) continue
      if (/^[\d\s\-/.$,*#:@]+$/.test(l.text)) continue    // pure numbers/symbols
      if (/^[\w.+-]+@/.test(l.text)) continue              // email line
      if (/^\+?\d[\d\s\-()]{7,}$/.test(l.text)) continue  // phone line
      if (l.text.length < 3) continue
      if (/client\s+id|member#|billing\s+address/i.test(l.lower)) continue

      // Clean any trailing OCR-concatenated invoice numbers
      let name = l.text
        .replace(/\s+Invoice\s+(?:Number|#|No\.?)\s*:?\s*[\d\-]+.*/i, "")
        .replace(/\s+\d+$/, "")
        .trim()

      if (name.length >= 3) { info.name = name; break }
    }
  }

  // Business suffix fallback
  if (!info.name) {
    const bm = full.match(/([\w\s&.,]{3,50}\s(?:Inc\.?|Ltd\.?|Corp\.?|LLC|LLP|Co\.?))/i)
    if (bm) info.name = bm[1].trim()
  }

  // Phone (prefer labeled)
  const phoneLbl = full.match(/(?:phone|ph|tel)[:\s]*(\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4})/i)
  if (phoneLbl) {
    info.phone = phoneLbl[1].trim()
  } else {
    const topText = lines.slice(0, 8)
      .filter(l => !/member|client|card|ref|auth/i.test(l.lower))
      .map(l => l.text).join("\n")
    const pm = topText.match(/(\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4})/)
    if (pm) info.phone = pm[1].trim()
  }

  // Email (prefer vendor section = before bill-to)
  const emailScope = billToIdx != null
    ? lines.filter(l => l.index < billToIdx!).map(l => l.text).join("\n")
    : full
  const em = emailScope.match(/[\w.+-]+@[\w.-]+\.\w+/)
  if (em) info.email = em[0]

  // GST number
  const gm = full.match(/GST\s*(?:#|No\.?|Number)?\s*:?\s*([\d\s]{5,20}(?:RT\d{4})?)/i)
  if (gm) {
    const raw = gm[1].trim()
    const digits = raw.replace(/\D/g, "").replace(/RT\d+/, "")
    if (digits.length >= 5) info.gstNumber = raw
  }

  // Address (Canadian postal code pattern)
  const am = full.match(/([\w\s.,#-]{5,60}[A-Z]\d[A-Z]\s*\d[A-Z]\d)/i)
  if (am) info.address = am[0].trim()

  return info
}

// ── Expense classification ─────────────────────────────────────────────────

const EXPENSE_CATEGORIES: Record<string, string[]> = {
  "Fuel & Gas": [
    "fuel", "gas", "gasoline", "diesel", "unleaded", "premium",
    "pump", "petro", "costco", "shell", "esso", "husky",
    "price/ltrs", "litres", "ltrs",
  ],
  "Telecommunications": [
    "phone", "mobile", "cellular", "data", "monthly fee",
    "rogers", "telus", "bell", "fido", "koodo", "lembei",
    "airtime", "data service", "activation",
  ],
  "Office Supplies": [
    "paper", "toner", "ink", "printer", "staple", "pen",
    "envelope", "folder", "stationery",
  ],
  "Industrial Supplies & Equipment": [
    "valve", "pipe", "fitting", "nipple", "elbow", "flange",
    "coupling", "steel", "sch 80", "sch80", "crane", "oilfield",
    "bolt", "nut", "gasket", "supply inc", "sa-106", "sa-105",
    "thrd", "smls", "ball valve",
  ],
  "Professional Services": [
    "consulting", "consultant", "management", "service fee",
    "advisory", "professional", "legal", "accounting",
  ],
  "Vehicle & Transportation": [
    "auto", "vehicle", "tire", "oil change", "rental car", "mileage", "parking",
  ],
  "Meals & Entertainment": [
    "restaurant", "cafe", "coffee", "catering", "lunch", "dinner",
  ],
  "Utilities": [
    "electricity", "water", "heat", "power", "utility", "enmax", "epcor", "atco",
  ],
}

function classifyExpense(full: string): [string, number] {
  const lower = full.toLowerCase()
  const scores: Record<string, number> = {}

  for (const [cat, kws] of Object.entries(EXPENSE_CATEGORIES)) {
    let score = 0
    for (const kw of kws) {
      const count = (lower.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length
      if (count > 0) score += count * (kw.includes(" ") ? 3 : 1.5)
    }
    scores[cat] = score
  }

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]
  if (!best || best[1] === 0) return ["Uncategorized", 0]
  const total = Object.values(scores).reduce((s, v) => s + v, 0)
  return [best[0], Math.round((best[1] / total) * 100) / 100]
}

// ── Line item extraction ───────────────────────────────────────────────────

const SKIP_LINE = /total|subtotal|gst|hst|pst|tax|payment|due|thank|ship|bill\s+to|approved/i

function extractLineItems(lines: TextLine[]) {
  const items: { description: string; quantity: number; unit_price: number; amount: number }[] = []

  for (const l of lines) {
    if (SKIP_LINE.test(l.lower)) continue
    const money = findMoneyValues(l.text)
    if (!money.length) continue
    const alpha = l.text.replace(/[\d\s$.,#\-/]/g, "")
    if (alpha.length < 3) continue

    const dm = l.text.match(/([A-Za-z][\w\s"'\-/#.,]{5,})/)
    const desc = dm ? dm[1].trim() : l.text
    const amt = money[money.length - 1][0]

    const qm = l.text.match(/(?:^|\s)(\d{1,4}(?:\.\d{1,2})?)\s/)
    const qty = qm ? parseFloat(qm[1]) : 1

    items.push({ description: desc, quantity: qty, unit_price: amt / qty, amount: amt })
  }
  return items
}

// ── Canadian rate snapping ─────────────────────────────────────────────────

function snapRate(derived: number): number {
  const known = [5, 11, 12, 13, 14.975, 15]
  const closest = known.reduce((a, b) => Math.abs(b - derived) < Math.abs(a - derived) ? b : a)
  return Math.abs(closest - derived) < 1 ? closest : derived
}

// ── Main extractor ─────────────────────────────────────────────────────────

function extractInvoiceData(text: string): Record<string, unknown> {
  const lines   = toLines(text)
  const lower   = text.toLowerCase()
  const notes: string[] = []

  // ── Document type & transaction type suggestion ──────────────────────────
  const docType = detectDocumentType(lower)
  const hasBillTo = /bill(?:ed)?\s+to|sold\s+to|invoice\s+to/i.test(text)
  const isReceipt = /customer\s+copy|retain\s+this\s+copy|transaction\s+record|packing\s+list/i.test(lower)
  const suggestedType: "INCOME" | "EXPENSE" = hasBillTo && !isReceipt ? "INCOME" : "EXPENSE"

  // ── Vendor detection ─────────────────────────────────────────────────────
  let companyName: string | null = null

  if (suggestedType === "INCOME") {
    // For outbound invoices (INCOME), extract the "Bill To" party as the company
    const bm = text.match(/(?:bill(?:ed)?\s+to|sold\s+to|invoice\s+to)\s*:?\s*\n?\s*([A-Z][^\n]{2,70})/i)
    if (bm) companyName = bm[1].trim().replace(/\s+/g, " ")
  }

  if (!companyName) {
    const vendor = detectVendor(lines, text)
    if (vendor.name) companyName = vendor.name
  }

  const vendorInfo = detectVendor(lines, text)

  // ── GST-included detection (Costco / gas receipts) ───────────────────────
  const gstIncludedMatch = text.match(/gst\s+included\s*=?\s*:?\s*\$?\s*([\d,]+\.\d{2})/i)
  const gstIncluded = !!gstIncludedMatch

  // ── Total amount ─────────────────────────────────────────────────────────
  const totalCandidates = scoreField(lines, TOTAL_ANCHORS, findMoneyValues, 2)
  let totalAmount: number | null = totalCandidates.length ? parseFloat(totalCandidates[0].value) : null
  if (totalCandidates.length)
    notes.push(`Total: "${totalCandidates[0].anchor}" (score=${totalCandidates[0].score.toFixed(1)})`)

  // ── Subtotal ──────────────────────────────────────────────────────────────
  const subCandidates = scoreField(lines, SUBTOTAL_ANCHORS, findMoneyValues, 2)
  let subtotal: number | null = subCandidates.length ? parseFloat(subCandidates[0].value) : null

  // ── GST amount ───────────────────────────────────────────────────────────
  let totalTax: number | null = null

  if (gstIncludedMatch) {
    // GST is INSIDE the total → read the "GST Included = $X" value directly
    totalTax = parseFloat(gstIncludedMatch[1].replace(/,/g, ""))
    notes.push("GST: included-in-total style (Costco/gas receipt)")
  } else {
    const gstCandidates = scoreField(lines, GST_ANCHORS, findMoneyValues, 2)
    for (const c of gstCandidates) {
      const v = parseFloat(c.value)
      if (totalAmount === null || v < totalAmount) { totalTax = v; break }
    }
  }

  // ── Date ─────────────────────────────────────────────────────────────────
  let invoiceDate: string | null = null
  const dateCandidates = scoreField(lines, DATE_ANCHORS, findDates, 2)
  if (dateCandidates.length) {
    invoiceDate = dateCandidates[0].value
    notes.push(`Date: "${dateCandidates[0].anchor}" (score=${dateCandidates[0].score.toFixed(1)})`)
  } else {
    const allDates = findDates(text)
    if (allDates.length) { invoiceDate = allDates[0][0]; notes.push("Date: fallback scan") }
  }

  // ── Invoice number ────────────────────────────────────────────────────────
  let invoiceNumber: string | null = null
  const invCandidates = scoreField(lines, INV_NUM_ANCHORS, findInvoiceTokens, 2)
  for (const c of invCandidates) {
    if (/^\d+\.\d{2}$/.test(c.value)) continue          // skip price-shaped values
    invoiceNumber = c.value.replace(/^#\s*/, "").trim()
    break
  }

  // ── Derive missing amounts ────────────────────────────────────────────────
  if (gstIncluded && totalAmount && totalTax) {
    subtotal = parseFloat((totalAmount - totalTax).toFixed(2))
    notes.push("Subtotal: back-calculated (total − GST included)")
  } else {
    if (!subtotal && totalAmount && totalTax)
      subtotal = parseFloat((totalAmount - totalTax).toFixed(2))
    if (!totalAmount && subtotal && totalTax)
      totalAmount = parseFloat((subtotal + totalTax).toFixed(2))
    if (!subtotal && totalAmount) subtotal = totalAmount
  }

  // ── Tax rate ──────────────────────────────────────────────────────────────
  let taxRate: number | null = null
  const rm = text.match(/(?:gst|hst|pst|qst|tax(?:\s+rate)?)\s*(?:@|at)?\s*([\d.]+)\s*%/i)
  if (rm) {
    taxRate = parseFloat(rm[1])
  } else if (subtotal && totalTax && subtotal > 0) {
    taxRate = snapRate(parseFloat(((totalTax / subtotal) * 100).toFixed(2)))
  }

  // ── Cross-validation ──────────────────────────────────────────────────────
  let needsReview = false
  if (totalAmount && totalTax && subtotal) {
    const expected = parseFloat((subtotal + totalTax).toFixed(2))
    if (Math.abs(expected - totalAmount) > 0.10) {
      notes.push(`WARNING: ${subtotal} + ${totalTax} = ${expected}, but total = ${totalAmount}`)
      needsReview = true
    }
  }
  if (!totalAmount && !subtotal) needsReview = true

  // ── Expense classification ────────────────────────────────────────────────
  const [expenseCat, expenseConf] = classifyExpense(text)

  // ── Line items ────────────────────────────────────────────────────────────
  const lineItems = extractLineItems(lines)

  return {
    company_name:        companyName,
    invoice_number:      invoiceNumber,
    invoice_date:        invoiceDate,
    line_items:          lineItems.length > 0 ? lineItems : null,
    subtotal:            subtotal  ?? null,
    total_gst:           totalTax  ?? null,
    total_amount:        totalAmount ?? null,
    tax_rate:            taxRate    ?? null,
    gst_included:        gstIncluded,
    suggested_type:      suggestedType,
    document_type:       docType,
    expense_category:    expenseCat,
    expense_confidence:  expenseConf,
    vendor_gst:          vendorInfo.gstNumber,
    needs_review:        needsReview,
    extraction_notes:    notes,
    currency:            "CAD",
    notes:               null,
  }
}

// ── POST handler ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
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

    // Save file
    const now  = new Date()
    const year = now.getFullYear()
    const mon  = String(now.getMonth() + 1).padStart(2, "0")
    const uploadPath = join(process.cwd(), UPLOAD_DIR, String(year), mon)
    await mkdir(uploadPath, { recursive: true })

    const ext      = extname(file.name)
    const fileName = `${randomUUID()}${ext}`
    const filePath = join(uploadPath, fileName)
    const relPath  = `${UPLOAD_DIR}/${year}/${mon}/${fileName}`

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    await writeFile(filePath, buffer)

    // Text extraction
    let rawText = ""
    if (file.type === "application/pdf") {
      rawText = await extractTextFromPDF(buffer)
      if (rawText.trim().length < 20)
        console.warn("PDF text extraction returned little content; file may be image-based.")
    } else {
      rawText = await extractTextFromImage(buffer)
    }

    let extractedData = null
    let extractionError = null

    if (rawText.trim().length > 5) {
      try {
        extractedData = extractInvoiceData(rawText)
        if (!extractedData.company_name && !extractedData.total_amount && !extractedData.subtotal)
          extractionError = "Could not parse invoice details — please fill in manually."
      } catch (err) {
        console.error("Extraction error:", err)
        extractionError = "Parsing failed. Please enter data manually."
      }
    } else {
      extractionError = "Could not extract text from file. Please enter data manually."
    }

    return NextResponse.json({
      success: true,
      file: {
        fileName,
        originalName: file.name,
        filePath: relPath,
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
