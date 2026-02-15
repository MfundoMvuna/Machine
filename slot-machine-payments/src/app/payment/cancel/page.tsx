import Link from "next/link";

export default function PaymentCancelPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#0f0f23] to-[#0a0a0a] flex items-center justify-center">
      <div className="glass-card p-12 text-center max-w-md mx-4">
        <div className="text-6xl mb-4">❌</div>
        <h1 className="text-2xl font-black text-yellow-400 mb-2">
          Payment Cancelled
        </h1>
        <p className="text-gray-400 mb-6">
          Your payment was cancelled. No charges were made. You can try again
          anytime.
        </p>
        <Link
          href="/"
          className="inline-block px-8 py-3 bg-[#2a2a4a] text-gray-300 rounded-xl font-bold hover:bg-[#3a3a5a] transition-colors"
        >
          ← Back to Game
        </Link>
      </div>
    </main>
  );
}
