import Link from "next/link";

export default function PaymentFailurePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#0f0f23] to-[#0a0a0a] flex items-center justify-center">
      <div className="glass-card p-12 text-center max-w-md mx-4">
        <div className="text-6xl mb-4">⚠️</div>
        <h1 className="text-2xl font-black text-red-400 mb-2">
          Payment Failed
        </h1>
        <p className="text-gray-400 mb-6">
          Something went wrong with your payment. Please try again or contact
          support if the issue persists.
        </p>
        <div className="space-y-3">
          <Link
            href="/"
            className="inline-block w-full px-8 py-3 bg-[#fbbf24] text-black rounded-xl font-bold hover:bg-[#f59e0b] transition-colors"
          >
            Try Again
          </Link>
          <Link
            href="/transactions"
            className="inline-block w-full px-8 py-3 bg-[#2a2a4a] text-gray-300 rounded-xl font-bold hover:bg-[#3a3a5a] transition-colors text-sm"
          >
            View Transaction History
          </Link>
        </div>
      </div>
    </main>
  );
}
