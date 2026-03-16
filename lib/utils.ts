import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency = "CAD"): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d)
}

export function calcGst(amountExclGst: number, gstRate: number) {
  const gstAmount = parseFloat((amountExclGst * gstRate / 100).toFixed(2))
  const totalAmount = parseFloat((amountExclGst + gstAmount).toFixed(2))
  return { gstAmount, totalAmount }
}

export function getMonthName(month: number): string {
  return new Date(2000, month - 1, 1).toLocaleString("en-CA", { month: "long" })
}

/** Calendar-year quarters: Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec */
export function getCalendarQuarter(month: number): number {
  return Math.ceil(month / 3)
}

export function getQuarterMonths(quarter: number): number[] {
  const map: Record<number, number[]> = {
    1: [1, 2, 3],
    2: [4, 5, 6],
    3: [7, 8, 9],
    4: [10, 11, 12],
  }
  return map[quarter] || []
}

export const MONTHS = [
  { value: 1,  label: "January" },
  { value: 2,  label: "February" },
  { value: 3,  label: "March" },
  { value: 4,  label: "April" },
  { value: 5,  label: "May" },
  { value: 6,  label: "June" },
  { value: 7,  label: "July" },
  { value: 8,  label: "August" },
  { value: 9,  label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
]

// ── Canadian provinces & territories ─────────────────────────────────────────

export interface ProvinceInfo {
  code: string
  name: string
  /** Tax label shown in the UI (GST, HST, GST+PST, GST+QST) */
  taxLabel: string
  /** Primary (or combined) rate applied to most goods/services */
  primaryRate: number
  /** Federal GST portion (always 5 % where GST applies) */
  federalRate: number
  /** Provincial portion (0 for HST-only or GST-only provinces) */
  provincialRate: number
  /** Common selectable rates for transactions in this province */
  commonRates: number[]
}

export const CANADIAN_PROVINCES: ProvinceInfo[] = [
  // GST-only provinces/territories
  { code: "AB", name: "Alberta",              taxLabel: "GST",     primaryRate: 5,      federalRate: 5,   provincialRate: 0,     commonRates: [0, 5] },
  { code: "NT", name: "Northwest Territories",taxLabel: "GST",     primaryRate: 5,      federalRate: 5,   provincialRate: 0,     commonRates: [0, 5] },
  { code: "NU", name: "Nunavut",              taxLabel: "GST",     primaryRate: 5,      federalRate: 5,   provincialRate: 0,     commonRates: [0, 5] },
  { code: "YT", name: "Yukon",               taxLabel: "GST",     primaryRate: 5,      federalRate: 5,   provincialRate: 0,     commonRates: [0, 5] },
  // HST provinces (combined federal + provincial)
  { code: "ON", name: "Ontario",             taxLabel: "HST",     primaryRate: 13,     federalRate: 5,   provincialRate: 8,     commonRates: [0, 13] },
  { code: "NB", name: "New Brunswick",       taxLabel: "HST",     primaryRate: 15,     federalRate: 5,   provincialRate: 10,    commonRates: [0, 15] },
  { code: "NL", name: "Newfoundland",        taxLabel: "HST",     primaryRate: 15,     federalRate: 5,   provincialRate: 10,    commonRates: [0, 15] },
  { code: "NS", name: "Nova Scotia",         taxLabel: "HST",     primaryRate: 15,     federalRate: 5,   provincialRate: 10,    commonRates: [0, 15] },
  { code: "PE", name: "Prince Edward Island",taxLabel: "HST",     primaryRate: 15,     federalRate: 5,   provincialRate: 10,    commonRates: [0, 15] },
  // GST + PST provinces
  { code: "BC", name: "British Columbia",    taxLabel: "GST+PST", primaryRate: 12,     federalRate: 5,   provincialRate: 7,     commonRates: [0, 5, 7, 12] },
  { code: "MB", name: "Manitoba",            taxLabel: "GST+RST", primaryRate: 12,     federalRate: 5,   provincialRate: 7,     commonRates: [0, 5, 7, 12] },
  { code: "SK", name: "Saskatchewan",        taxLabel: "GST+PST", primaryRate: 11,     federalRate: 5,   provincialRate: 6,     commonRates: [0, 5, 6, 11] },
  // GST + QST
  { code: "QC", name: "Quebec",              taxLabel: "GST+QST", primaryRate: 14.975, federalRate: 5,   provincialRate: 9.975, commonRates: [0, 5, 9.975, 14.975] },
]

export const DEFAULT_PROVINCE = "AB"

export function getProvince(code: string): ProvinceInfo {
  return CANADIAN_PROVINCES.find(p => p.code === code) ?? CANADIAN_PROVINCES[0]
}

/** Rates to show for a given province (used in dropdowns) */
export function getTaxRatesForProvince(provinceCode: string): number[] {
  return getProvince(provinceCode).commonRates
}

/** Default transaction tax rate for a province */
export function getDefaultTaxRate(provinceCode: string): number {
  return getProvince(provinceCode).primaryRate
}

/** Tax label (GST / HST / etc.) for display */
export function getTaxLabel(provinceCode: string): string {
  return getProvince(provinceCode).taxLabel
}

/** All unique combined tax rates across Canadian provinces, for dropdowns */
export const CA_TAX_RATES = [0, 5, 11, 12, 13, 14.975, 15]
