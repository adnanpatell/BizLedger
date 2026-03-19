import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import LoginClient from "./login-client"

export default async function LoginPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect(user.user_metadata?.onboarded ? "/" : "/onboarding")
  return <LoginClient />
}
