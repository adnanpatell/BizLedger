import { Suspense } from "react"
import { LedgerClient } from "@/components/ledger/ledger-client"
import { Skeleton } from "@/components/ui/skeleton"

export default function LedgerPage() {
  return (
    <Suspense fallback={<div className="p-6"><Skeleton className="h-96 w-full" /></div>}>
      <LedgerClient />
    </Suspense>
  )
}
