/**
 * lib/invoice-extractor.ts
 *
 * Class-based invoice data extractor with 4-phase pipeline:
 *  Phase 1 – Preprocessor   : OCR error correction + text normalisation
 *  Phase 2 – Locator/Scorer : Anchor-proximity scoring with explicit bonuses
 *  Phase 3 – Validator      : A + B = C checksum with confidence 0-100
 *  Phase 4 – Assembler      : Combines all fields into a typed result
 *
 * Zero external API calls — runs entirely on the server.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface TextLine {
  index: number
  text: string
  lower: string
}

export interface ScoredCandidate {
  value: string
  score: number
  sourceLine: number
  anchor: string
}

export interface LineItem {
  description: string
  quantity: number
  unit_price: number
  gst_rate: number
  amount: number
}

export interface ExtractionResult {
  company_name:       string | null
  invoice_number:     string | null
  invoice_date:       string | null
  line_items:         LineItem[] | null
  subtotal:           number | null
  total_gst:          number | null
  total_amount:       number | null
  tax_rate:           number | null
  gst_included:       boolean
  suggested_type:     "INCOME" | "EXPENSE"
  document_type:      string
  expense_category:   string
  expense_confidence: number
  vendor_gst:         string
  needs_review:       boolean
  confidence:         number        // 0–100: extraction confidence score
  checksum_method:    string        // how the financial triple was resolved
  extraction_notes:   string[]
  currency:           string
  notes:              null
}

// Anchor: [matchText, weight]
type Anchor     = [string, number]
type MoneyTuple = [number, number, number]   // [value, charStart, charEnd]
type DateTuple  = [string, number, number]   // [YYYY-MM-DD, start, end]
type InvTuple   = [string, number, number]   // [token, start, end]

// ── Phase 1 — Preprocessor ─────────────────────────────────────────────────

class Preprocessor {
  /**
   * Fix common OCR mis-reads and normalise whitespace.
   * E.g. Tesseract often reads '$' as 'S', '1' as 'l', '0' as 'O'.
   */
  static clean(raw: string): string {
    return raw
      // OCR character fixes
      .replace(/\bS\s*(?=\d{1,3}(?:[.,]\d{2,3})*\.\d{2})/g, "$")  // S12.50 → $12.50
      .replace(/(?<=\$\s*)\s+(?=\d)/g, "")                          // $ 12.50 → $12.50
      .replace(/(?<=[^\d])l(?=\d)/g, "1")                           // l23 → 123
      .replace(/(?<=[^\d])O(?=\.\d{2})/g, "0")                      // O.50 → 0.50
      // Normalise whitespace (preserve newlines for line structure)
      .replace(/[ \t]+/g, " ")
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function toLines(text: string): TextLine[] {
  return text
    .split(/\r?\n/)
    .map((t, i) => ({ index: i, text: t.trim(), lower: t.trim().toLowerCase() }))
    .filter(l => l.text.length > 0)
}

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
    if (val > 0 && !seen.has(val)) { seen.add(val); results.push([val, m.index, m.index + m[0].length]) }
  }
  // Bare "227.47" (not preceded/followed by another digit)
  const barePat = /(?<!\d)(\d{1,6}\.\d{2})(?!\d)/g
  while ((m = barePat.exec(text)) !== null) {
    const val = parseFloat(m[1])
    if (val > 0 && !seen.has(val)) { seen.add(val); results.push([val, m.index, m.index + m[0].length]) }
  }
  // OCR often drops decimals: "$21663" or bare "21663" after anchor keywords
  // Match $-prefixed integers OR comma-grouped integers (e.g. 21,663)
  const intPat = /\$\s*(\d{3,7})(?!\d|[.,])|\b(\d{1,3}(?:,\d{3})+)(?!\d|[.,\d])/g
  while ((m = intPat.exec(text)) !== null) {
    const raw = (m[1] || m[2] || "").replace(/,/g, "")
    const val = parseFloat(raw)
    if (val > 0 && !seen.has(val)) { seen.add(val); results.push([val, m.index, m.index + m[0].length]) }
  }
  // Integers right after price anchors (OCR may drop $ and decimal completely)
  // e.g. "Subtotal: 21663"  "Total: 1083"
  const anchorIntPat = /(?:subtotal|total|amount|balance|due|gst|hst|pst)\s*:?\s*\$?\s*(\d{3,7})(?!\d|[.,])/gi
  while ((m = anchorIntPat.exec(text)) !== null) {
    const val = parseFloat(m[1])
    if (val > 0 && !seen.has(val)) { seen.add(val); results.push([val, m.index, m.index + m[0].length]) }
  }
  return results
}

const MONTH_MAP: Record<string, number> = {
  jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12,
  january:1,february:2,march:3,april:4,june:6,july:7,august:8,
  september:9,october:10,november:11,december:12,
}

function parseISO(y: string, m: string, d: string): string | null {
  const yi = parseInt(y), mi = parseInt(m), di = parseInt(d)
  if (yi >= 2000 && yi <= 2099 && mi >= 1 && mi <= 12 && di >= 1 && di <= 31)
    return `${yi}-${String(mi).padStart(2,"0")}-${String(di).padStart(2,"0")}`
  return null
}

function findDates(text: string): DateTuple[] {
  const results: DateTuple[] = []
  const seen = new Set<string>()
  const add = (d: string|null, s: number, e: number) => {
    if (d && !seen.has(d)) { seen.add(d); results.push([d, s, e]) }
  }
  for (const m of text.matchAll(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/g))
    add(parseISO(m[1],m[2],m[3]), m.index!, m.index!+m[0].length)
  for (const m of text.matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g)) {
    const a=parseInt(m[1]),b=parseInt(m[2]),y=m[3]
    const [mo,da]=a>12?[b,a]:[a,b]
    add(parseISO(y,String(mo),String(da)), m.index!, m.index!+m[0].length)
  }
  for (const m of text.matchAll(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})[,\s]+(\d{4})\b/gi)) {
    const mo=MONTH_MAP[m[1].slice(0,3).toLowerCase()]
    if (mo) add(parseISO(m[3],String(mo),m[2]), m.index!, m.index!+m[0].length)
  }
  for (const m of text.matchAll(/\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{4})\b/gi)) {
    const mo=MONTH_MAP[m[2].slice(0,3).toLowerCase()]
    if (mo) add(parseISO(m[3],String(mo),m[1]), m.index!, m.index!+m[0].length)
  }
  return results
}

const INV_PAT = /(?:#\s*)?(\d[\d\-\.\/A-Z]{1,25}\d)|(?:#\s*)([A-Z]{1,5}[\-\.]?\d{3,15})|(\d{4,15})/gi
function findInvoiceTokens(text: string): InvTuple[] {
  const results: InvTuple[] = []
  for (const m of text.matchAll(INV_PAT)) {
    const val = (m[1]||m[2]||m[3]||"").trim()
    if (val.length >= 3) results.push([val, m.index!, m.index!+m[0].length])
  }
  return results
}

function snapRate(derived: number): number {
  const known = [5, 11, 12, 13, 14.975, 15]
  const closest = known.reduce((a,b) => Math.abs(b-derived)<Math.abs(a-derived)?b:a)
  return Math.abs(closest-derived) < 1 ? closest : derived
}

// ── Anchor Tables ──────────────────────────────────────────────────────────

const TOTAL_ANCHORS: Anchor[] = [
  ["grand total",   12], ["total due",      10], ["total amount",  10],
  ["amount due",     9], ["balance due",     9], ["total:",        10],
  ["total $",       10], ["total cad",       9], ["net amount",     8],
  ["fuel sale",      6], ["amt:",             7], ["cad ",           5],
]

const SUBTOTAL_ANCHORS: Anchor[] = [
  ["subtotal",             10], ["sub-total",             10],
  ["total w/o gst",        10], ["total without gst",     10],
  ["total before tax",     10], ["amount before tax",     10],
  ["taxable amount",        8],
]

const GST_ANCHORS: Anchor[] = [
  ["gst (5%)", 10], ["gst:",  10], ["gst included",  9],
  ["gst",       8], ["hst",    8], ["pst",            7],
  ["tps",       7], ["tvq",    7],
]

const DATE_ANCHORS: Anchor[] = [
  ["invoice date", 12], ["inv date",  11], ["bill date",  10],
  ["date:",        10], ["date",        6], ["ship date",  4],
  ["due date",      3],
]

const INV_NUM_ANCHORS: Anchor[] = [
  ["invoice #",      12], ["invoice number", 12], ["invoice no",  12],
  ["inv #",          11], ["order number",    6],  ["transaction#", 7],
  ["receipt #",       8], ["receipt no",      8],  ["ref:",          4],
]

// ── Phase 2 — Locator ──────────────────────────────────────────────────────

interface AnchorHit {
  lineIndex: number
  anchorText: string
  weight: number
  charPos: number
}

class Locator {
  static findAnchors(lines: TextLine[], anchors: Anchor[]): AnchorHit[] {
    const hits: AnchorHit[] = []
    for (const line of lines) {
      for (const [anchorText, weight] of anchors) {
        const pos = line.lower.indexOf(anchorText.toLowerCase())
        if (pos !== -1) hits.push({ lineIndex: line.index, anchorText, weight, charPos: pos })
      }
    }
    return hits
  }
}

// ── Phase 2 — Scorer ───────────────────────────────────────────────────────

class Scorer {
  /**
   * Score currency candidates using all proximity bonuses from the spec:
   *
   *  +50  Candidate is the largest number on the entire page
   *  +30  A total anchor appears on the SAME line, before the number
   *  +20  A total anchor appears on the line DIRECTLY ABOVE (L-1)
   *  -50  A subtotal anchor appears on the SAME line  ← penalise subtotals
   *  base weight × proximity decay
   */
  static scoreMoney(
    lines: TextLine[],
    anchors: Anchor[],
    subtotalAnchors: Anchor[],
    pageMaxValue: number,
    maxDist = 3,
  ): ScoredCandidate[] {
    const anchorHits    = Locator.findAnchors(lines, anchors)
    const subtotalLines = new Set(Locator.findAnchors(lines, subtotalAnchors).map(h => h.lineIndex))

    // Deduplicate by value — keep highest score
    const best = new Map<number, ScoredCandidate>()

    for (const hit of anchorHits) {
      for (const line of lines) {
        const dist = Math.abs(line.index - hit.lineIndex)
        if (dist > maxDist) continue

        for (const [val, charStart] of findMoneyValues(line.text)) {
          if (val <= 0) continue

          // Base score: anchor weight × proximity decay
          let score = hit.weight * (1.0 / (1.0 + dist * 0.5))

          // +50 — largest number on the page
          if (val === pageMaxValue && pageMaxValue > 0) score += 50

          // +30 — anchor on SAME line, candidate sits to the RIGHT of it
          if (line.index === hit.lineIndex && charStart > hit.charPos) score += 30

          // +20 — anchor on the line directly ABOVE
          if (hit.lineIndex === line.index - 1) score += 20

          // -50 — subtotal anchor on same line (this is a subtotal, not total)
          if (subtotalLines.has(line.index)) score -= 50

          const existing = best.get(val)
          if (!existing || score > existing.score) {
            best.set(val, { value: String(val), score, sourceLine: line.index, anchor: hit.anchorText })
          }
        }
      }
    }

    return Array.from(best.values()).sort((a, b) => b.score - a.score)
  }

  /** Generic scorer for non-monetary fields (dates, invoice numbers). */
  static scoreField<T extends [unknown, number, number]>(
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
            candidates.push({ value: String(val), score: weight*proximity+sameLineBonus, sourceLine: other.index, anchor: anchorText })
          }
        }
      }
    }
    return candidates.sort((a, b) => b.score - a.score)
  }
}

// ── Phase 3 — Validator ────────────────────────────────────────────────────

interface ChecksumResult {
  subtotal: number
  tax: number
  total: number
  confidence: number   // 0–100
  method: string
}

class Validator {
  /**
   * Take the top-N scored candidates and try every combination to find:
   *   subtotal + tax ≈ total  (within $0.02)
   *
   * If found → confidence = 100.
   * If only 2 numbers available → confidence = 75 (assume no tax).
   * Otherwise → confidence = 50 (largest number as total).
   */
  static checksum(candidates: ScoredCandidate[], topN = 8): ChecksumResult | null {
    const vals = [...new Set(
      candidates.slice(0, topN).map(c => parseFloat(c.value)).filter(v => v > 0)
    )].sort((a, b) => b - a)

    if (vals.length === 0) return null

    const EPSILON = 0.02

    // --- Exact triple search: A + B = C ---
    for (const c of vals) {          // candidate for TOTAL (largest)
      for (const b of vals) {        // candidate for TAX
        if (b >= c) continue
        for (const a of vals) {      // candidate for SUBTOTAL
          if (a === c || a === b) continue
          if (Math.abs(a + b - c) <= EPSILON && b / c < 0.50) {
            return { subtotal: a, tax: b, total: c, confidence: 100, method: "checksum_exact" }
          }
        }
      }
    }

    // --- Implied triple: does (largest - second) produce a plausible tax? ---
    if (vals.length >= 2) {
      const total    = vals[0]
      const subtotal = vals[1]
      const impliedTax = parseFloat((total - subtotal).toFixed(2))
      if (impliedTax > 0 && impliedTax / total < 0.30) {
        // Check if that implied tax matches a 3rd candidate within $0.50
        const taxMatch = vals.find(v => v !== total && v !== subtotal && Math.abs(v - impliedTax) < 0.50)
        if (taxMatch) {
          return { subtotal, tax: taxMatch, total, confidence: 90, method: "checksum_implied" }
        }
        return { subtotal, tax: impliedTax, total, confidence: 75, method: "implied_tax" }
      }
    }

    // --- Fallback: just pick the largest ---
    if (vals.length >= 1) {
      return { subtotal: vals[0], tax: 0, total: vals[0], confidence: 50, method: "largest_only" }
    }

    return null
  }

  /** Returns true if subtotal + tax ≈ total (within $0.10). */
  static verify(subtotal: number, tax: number, total: number): boolean {
    return Math.abs(subtotal + tax - total) <= 0.10
  }
}

// ── Vendor / company detection ─────────────────────────────────────────────

interface VendorInfo { name: string; phone: string; email: string; gstNumber: string; address: string }

const KNOWN_VENDORS: [RegExp, string][] = [
  [/costco/i,                         "Costco"],
  [/swift\s+oilfield\s+supply/i,      "Swift Oilfield Supply Inc."],
  [/swift\s+supply/i,                 "Swift Supply"],
  [/atco\s+gas/i,                     "ATCO Gas"],
  [/atco\s+electric/i,                "ATCO Electric"],
  [/\benmax\b/i,                      "ENMAX"],
  [/\bepcor\b/i,                      "EPCOR"],
  [/fortis(?:alberta|bc)/i,           "FortisAlberta"],
  [/shaw\s+(?:business|communications)/i, "Shaw Business"],
  [/\btelus\b/i,                      "TELUS"],
  [/rogers\s+(?:communications|wireless)/i, "Rogers Communications"],
  [/\bbell\s+canada\b/i,              "Bell Canada"],
  [/hydro\s+one/i,                    "Hydro One"],
  [/bc\s+hydro/i,                     "BC Hydro"],
  [/singlesource/i,                   "Singlesource Project Management Inc"],
  [/petro[-\s]canada/i,               "Petro-Canada"],
  [/\bshell\b/i,                      "Shell"],
  [/\besso\b/i,                       "Esso"],
  [/amazon\s+web\s+services/i,        "Amazon Web Services"],
  [/microsoft\s+canada/i,             "Microsoft Canada"],
]

const SKIP_HEADER = new Set([
  "invoice","packing list","receipt","transaction record","statement","bill",
  "cardholder copy","your detailed invoice","thank you for your business",
  "cash sale","customer copy",
])

function detectVendor(lines: TextLine[], full: string): VendorInfo {
  const info: VendorInfo = { name:"", phone:"", email:"", gstNumber:"", address:"" }

  let billToIdx: number|null = null
  for (const l of lines) {
    if (/bill\s+to|sold\s+to|ship\s+to|customer|client\s+id/i.test(l.lower)) { billToIdx = l.index; break }
  }

  for (const [re, name] of KNOWN_VENDORS) { if (re.test(full)) { info.name = name; break } }

  if (!info.name) {
    for (const l of lines.slice(0, 12)) {
      if (billToIdx !== null && l.index >= billToIdx) break
      const clean = l.lower.replace(/[\d\s\-/.$,*#:]+/g," ").trim()
      if (SKIP_HEADER.has(clean)) continue
      if (/^[\d\s\-/.$,*#:@]+$/.test(l.text)) continue
      if (/^[\w.+-]+@/.test(l.text)) continue
      if (/^\+?\d[\d\s\-()]{7,}$/.test(l.text)) continue
      if (l.text.length < 3) continue
      if (/client\s+id|member#|billing\s+address/i.test(l.lower)) continue
      let name = l.text
        .replace(/\s+Invoice\s+(?:Number|#|No\.?)\s*:?\s*[\d\-]+.*/i,"")
        .replace(/\s+\d+$/,"").trim()
      if (name.length >= 3) { info.name = name; break }
    }
  }

  if (!info.name) {
    const bm = full.match(/([\w\s&.,]{3,50}\s(?:Inc\.?|Ltd\.?|Corp\.?|LLC|LLP|Co\.?))/i)
    if (bm) info.name = bm[1].trim()
  }

  const phoneLbl = full.match(/(?:phone|ph|tel)[:\s]*(\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4})/i)
  if (phoneLbl) {
    info.phone = phoneLbl[1].trim()
  } else {
    const topText = lines.slice(0,8).filter(l => !/member|client|card|ref|auth/i.test(l.lower)).map(l=>l.text).join("\n")
    const pm = topText.match(/(\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4})/)
    if (pm) info.phone = pm[1].trim()
  }

  const emailScope = billToIdx!=null ? lines.filter(l=>l.index<billToIdx!).map(l=>l.text).join("\n") : full
  const em = emailScope.match(/[\w.+-]+@[\w.-]+\.\w+/)
  if (em) info.email = em[0]

  const gm = full.match(/GST\s*(?:#|No\.?|Number)?\s*:?\s*([\d\s]{5,20}(?:RT\d{4})?)/i)
  if (gm) {
    const raw = gm[1].trim()
    if (raw.replace(/\D/g,"").replace(/RT\d+/,"").length >= 5) info.gstNumber = raw
  }

  const am = full.match(/([\w\s.,#-]{5,60}[A-Z]\d[A-Z]\s*\d[A-Z]\d)/i)
  if (am) info.address = am[0].trim()

  return info
}

// ── Expense classification ─────────────────────────────────────────────────

const EXPENSE_CATEGORIES: Record<string, string[]> = {
  "Fuel & Gas":["fuel","gas","gasoline","diesel","unleaded","premium","pump","petro","costco","shell","esso","husky","price/ltrs","litres","ltrs"],
  "Telecommunications":["phone","mobile","cellular","data","monthly fee","rogers","telus","bell","fido","koodo","airtime","data service","activation"],
  "Office Supplies":["paper","toner","ink","printer","staple","pen","envelope","folder","stationery"],
  "Industrial Supplies & Equipment":["valve","pipe","fitting","nipple","elbow","flange","coupling","steel","sch 80","sch80","crane","oilfield","bolt","nut","gasket","supply inc","sa-106","ball valve"],
  "Professional Services":["consulting","consultant","management","service fee","advisory","professional","legal","accounting"],
  "Vehicle & Transportation":["auto","vehicle","tire","oil change","rental car","mileage","parking"],
  "Meals & Entertainment":["restaurant","cafe","coffee","catering","lunch","dinner"],
  "Utilities":["electricity","water","heat","power","utility","enmax","epcor","atco"],
}

function classifyExpense(full: string): [string, number] {
  const lower = full.toLowerCase()
  const scores: Record<string,number> = {}
  for (const [cat, kws] of Object.entries(EXPENSE_CATEGORIES)) {
    let score = 0
    for (const kw of kws) {
      const count = (lower.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"g")) || []).length
      if (count > 0) score += count * (kw.includes(" ") ? 3 : 1.5)
    }
    scores[cat] = score
  }
  const best = Object.entries(scores).sort((a,b) => b[1]-a[1])[0]
  if (!best || best[1]===0) return ["Uncategorized", 0]
  const total = Object.values(scores).reduce((s,v) => s+v, 0)
  return [best[0], Math.round((best[1]/total)*100)/100]
}

// ── Line item extraction ───────────────────────────────────────────────────

const SKIP_LINE = /total|subtotal|gst|hst|pst|tax|payment|due|thank|ship|bill\s+to|approved/i

function extractLineItems(lines: TextLine[]): LineItem[] {
  const items: LineItem[] = []
  for (const l of lines) {
    if (SKIP_LINE.test(l.lower)) continue
    const money = findMoneyValues(l.text)
    if (!money.length) continue
    const alpha = l.text.replace(/[\d\s$.,#\-/]/g,"")
    if (alpha.length < 3) continue
    const dm = l.text.match(/([A-Za-z][\w\s"'\-/#.,]{5,})/)
    const desc = dm ? dm[1].trim() : l.text
    const amt = money[money.length-1][0]
    const qm = l.text.match(/(?:^|\s)(\d{1,4}(?:\.\d{1,2})?)\s/)
    const qty = qm ? parseFloat(qm[1]) : 1
    items.push({ description: desc, quantity: qty, unit_price: amt/qty, gst_rate: 0, amount: amt })
  }
  return items
}

// ── Phase 4 — InvoiceExtractor (Assembler) ────────────────────────────────

export class InvoiceExtractor {
  private readonly text: string
  private readonly lines: TextLine[]
  private readonly lower: string
  private readonly pageMaxValue: number

  constructor(rawText: string) {
    this.text  = Preprocessor.clean(rawText)
    this.lines = toLines(this.text)
    this.lower = this.text.toLowerCase()
    const allMoney = findMoneyValues(this.text)
    this.pageMaxValue = allMoney.length ? Math.max(...allMoney.map(([v]) => v)) : 0
  }

  // ── Document type ──────────────────────────────────────────────────────

  private detectDocType(): string {
    if (/packing\s+list|packing\s+slip/.test(this.lower))     return "packing_list"
    if (/transaction\s+record|customer\s+copy/.test(this.lower)) return "receipt"
    if (/purchase\s+order/.test(this.lower))                   return "purchase_order"
    if (/statement/.test(this.lower))                          return "statement"
    if (/quote|quotation|estimate/.test(this.lower))           return "quote"
    if (/invoice/.test(this.lower))                            return "invoice"
    return "unknown"
  }

  // ── Main extraction ────────────────────────────────────────────────────

  extract(): ExtractionResult {
    const notes: string[] = []
    const LOG = "[InvoiceExtractor]"

    // ── Phase 1 diagnostics ────────────────────────────────────────────
    const allMoneyOnPage = findMoneyValues(this.text)
    console.log(`${LOG} lines=${this.lines.length} moneyValues=[${allMoneyOnPage.map(([v])=>v).join(", ")}] pageMax=${this.pageMaxValue}`)

    // ── Document / transaction type ────────────────────────────────────
    const docType     = this.detectDocType()
    const hasBillTo   = /bill(?:ed)?\s+to|sold\s+to|invoice\s+to/i.test(this.text)
    const isReceipt   = /customer\s+copy|retain\s+this\s+copy|transaction\s+record|packing\s+list/i.test(this.lower)
    const suggestedType: "INCOME"|"EXPENSE" = hasBillTo && !isReceipt ? "INCOME" : "EXPENSE"
    console.log(`${LOG} docType="${docType}" suggestedType="${suggestedType}" hasBillTo=${hasBillTo}`)

    // ── Vendor ────────────────────────────────────────────────────────
    let companyName: string|null = null
    if (suggestedType === "INCOME") {
      const bm = this.text.match(/(?:bill(?:ed)?\s+to|sold\s+to|invoice\s+to)\s*:?\s*\n?\s*([A-Z][^\n]{2,70})/i)
      if (bm) companyName = bm[1].trim().replace(/\s+/g," ")
    }
    const vendorInfo = detectVendor(this.lines, this.text)
    if (!companyName && vendorInfo.name) companyName = vendorInfo.name
    console.log(`${LOG} vendor="${companyName}" gstNumber="${vendorInfo.gstNumber}"`)

    // ── GST-included (Costco / gas receipt) ───────────────────────────
    const gstIncludedMatch = this.text.match(/gst\s+included\s*=?\s*:?\s*\$?\s*([\d,]+\.\d{2})/i)
    const gstIncluded      = !!gstIncludedMatch

    // ── Phase 2: Score total candidates ──────────────────────────────
    const totalCandidates = Scorer.scoreMoney(
      this.lines, TOTAL_ANCHORS, SUBTOTAL_ANCHORS, this.pageMaxValue, 3
    )
    if (totalCandidates.length)
      notes.push(`Total: "${totalCandidates[0].anchor}" score=${totalCandidates[0].score.toFixed(1)}`)
    console.log(`${LOG} totalCandidates top-5:`, totalCandidates.slice(0,5).map(c=>`${c.value}(score=${c.score.toFixed(1)},anchor="${c.anchor}",line=${c.sourceLine})`))

    // ── Phase 2: Score subtotal candidates ───────────────────────────
    const subCandidates = Scorer.scoreField(this.lines, SUBTOTAL_ANCHORS, findMoneyValues, 2)
    console.log(`${LOG} subCandidates top-3:`, subCandidates.slice(0,3).map(c=>`${c.value}(score=${c.score.toFixed(1)},anchor="${c.anchor}")`))

    // ── Phase 2: Score GST candidates ────────────────────────────────
    let rawGst: number|null = null
    if (gstIncludedMatch) {
      rawGst = parseFloat(gstIncludedMatch[1].replace(/,/g,""))
      notes.push("GST: included-in-total style (Costco/gas receipt)")
      console.log(`${LOG} GST: included-in-total=${rawGst}`)
    } else {
      const gstCandidates = Scorer.scoreField(this.lines, GST_ANCHORS, findMoneyValues, 2)
      console.log(`${LOG} gstCandidates top-3:`, gstCandidates.slice(0,3).map(c=>`${c.value}(score=${c.score.toFixed(1)},anchor="${c.anchor}")`))
      for (const c of gstCandidates) {
        const v = parseFloat(c.value)
        const topTotal = totalCandidates[0] ? parseFloat(totalCandidates[0].value) : Infinity
        if (v < topTotal) { rawGst = v; break }
      }
      console.log(`${LOG} rawGst=${rawGst}`)
    }

    // ── Phase 3: Checksum validator ───────────────────────────────────
    // Feed top candidates from the total scorer into the checksum loop
    const validation = Validator.checksum(totalCandidates, 10)
    console.log(`${LOG} checksum:`, validation ? `method="${validation.method}" confidence=${validation.confidence} sub=${validation.subtotal} tax=${validation.tax} total=${validation.total}` : "null (no candidates)")

    // Determine final financial triple
    let totalAmount: number|null  = totalCandidates.length ? parseFloat(totalCandidates[0].value) : null
    let subtotal:    number|null  = subCandidates.length   ? parseFloat(subCandidates[0].value)   : null
    let totalTax:    number|null  = rawGst

    let confidence    = 50
    let checksumMethod = "scored_top1"

    if (validation) {
      confidence     = validation.confidence
      checksumMethod = validation.method

      if (validation.confidence >= 90) {
        // Checksum found a verified triple — use it
        totalAmount = validation.total
        totalTax    = validation.tax > 0 ? validation.tax : totalTax
        subtotal    = validation.subtotal !== validation.total ? validation.subtotal : subtotal
        notes.push(`Checksum: ${validation.method} (confidence=${validation.confidence}%)`)
      }
    }

    // ── Derive missing amounts ────────────────────────────────────────
    if (gstIncluded && totalAmount && totalTax) {
      subtotal = parseFloat((totalAmount - totalTax).toFixed(2))
      notes.push("Subtotal: back-calc (total − GST included)")
    } else {
      if (!subtotal && totalAmount && totalTax)
        subtotal = parseFloat((totalAmount - totalTax).toFixed(2))
      if (!totalAmount && subtotal && totalTax)
        totalAmount = parseFloat((subtotal + totalTax).toFixed(2))
      if (!subtotal && totalAmount)
        subtotal = totalAmount
    }

    // ── Tax rate ──────────────────────────────────────────────────────
    let taxRate: number|null = null
    const rm = this.text.match(/(?:gst|hst|pst|qst|tax(?:\s+rate)?)\s*(?:@|at)?\s*([\d.]+)\s*%/i)
    if (rm) {
      taxRate = parseFloat(rm[1])
    } else if (subtotal && totalTax && subtotal > 0) {
      taxRate = snapRate(parseFloat(((totalTax/subtotal)*100).toFixed(2)))
    }

    console.log(`${LOG} finalTriple: subtotal=${subtotal} tax=${totalTax} total=${totalAmount} confidence=${confidence} method="${checksumMethod}"`)

    // ── Final cross-validation ────────────────────────────────────────
    let needsReview = false
    if (totalAmount && totalTax && subtotal) {
      if (!Validator.verify(subtotal, totalTax, totalAmount)) {
        notes.push(`WARNING: ${subtotal} + ${totalTax} ≠ ${totalAmount} (diff=${Math.abs(subtotal+totalTax-totalAmount).toFixed(2)})`)
        needsReview = true
        confidence  = Math.max(0, confidence - 30)
      }
    }
    if (!totalAmount && !subtotal) { needsReview = true; confidence = 0 }

    // ── Date ──────────────────────────────────────────────────────────
    let invoiceDate: string|null = null
    const dateCandidates = Scorer.scoreField(this.lines, DATE_ANCHORS, findDates, 2)
    if (dateCandidates.length) {
      invoiceDate = dateCandidates[0].value
      notes.push(`Date: "${dateCandidates[0].anchor}" score=${dateCandidates[0].score.toFixed(1)}`)
    } else {
      const allDates = findDates(this.text)
      if (allDates.length) { invoiceDate = allDates[0][0]; notes.push("Date: fallback scan") }
    }

    // ── Invoice number ─────────────────────────────────────────────────
    let invoiceNumber: string|null = null
    const invCandidates = Scorer.scoreField(this.lines, INV_NUM_ANCHORS, findInvoiceTokens, 2)
    for (const c of invCandidates) {
      if (/^\d+\.\d{2}$/.test(c.value)) continue
      invoiceNumber = c.value.replace(/^#\s*/,"").trim()
      break
    }

    // ── Expense classification ─────────────────────────────────────────
    const [expenseCat, expenseConf] = classifyExpense(this.text)

    // ── Line items ─────────────────────────────────────────────────────
    const lineItems = extractLineItems(this.lines)

    console.log(`${LOG} RESULT: company="${companyName}" date="${invoiceDate}" inv#="${invoiceNumber}" sub=${subtotal} tax=${totalTax} total=${totalAmount} taxRate=${taxRate}% confidence=${confidence} needsReview=${needsReview} notes=[${notes.join(" | ")}]`)

    return {
      company_name:       companyName,
      invoice_number:     invoiceNumber,
      invoice_date:       invoiceDate,
      line_items:         lineItems.length > 0 ? lineItems : null,
      subtotal:           subtotal    ?? null,
      total_gst:          totalTax    ?? null,
      total_amount:       totalAmount ?? null,
      tax_rate:           taxRate     ?? null,
      gst_included:       gstIncluded,
      suggested_type:     suggestedType,
      document_type:      docType,
      expense_category:   expenseCat,
      expense_confidence: expenseConf,
      vendor_gst:         vendorInfo.gstNumber,
      needs_review:       needsReview,
      confidence,
      checksum_method:    checksumMethod,
      extraction_notes:   notes,
      currency:           "CAD",
      notes:              null,
    }
  }
}
