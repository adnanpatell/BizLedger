import { createClient } from "@/lib/supabase/client"

const BASE = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "")

export function apiUrl(path: string): string {
  return `${BASE}${path}`
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token

  const isFormData = init?.body instanceof FormData

  return fetch(apiUrl(path), {
    ...init,
    headers: {
      ...(!isFormData && { "Content-Type": "application/json" }),
      ...(token && { Authorization: `Bearer ${token}` }),
      ...init?.headers,
    },
  })
}
