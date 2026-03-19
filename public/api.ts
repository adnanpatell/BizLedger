// Base URL for all API calls.
// In development (NEXT_PUBLIC_API_URL not set) → uses relative URLs → Next.js API routes.
// In production (NEXT_PUBLIC_API_URL set to the backend URL) → calls the external backend.
const BASE = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "")

export function apiUrl(path: string): string {
  return `${BASE}${path}`
}
