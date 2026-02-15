import Link from "next/link";

export default function PaymentSuccessPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#0f0f23] to-[#0a0a0a] flex items-center justify-center">
      <div className="glass-card p-12 text-center max-w-md mx-4">
        <div className="text-6xl mb-4">✅</div>
        <h1 className="text-2xl font-black text-green-400 mb-2">
          Payment Successful!
        </h1>
        <p className="text-gray-400 mb-6">
          Your credits have been added to your balance. The webhook confirmation
          may take a few seconds to process.
        </p>
        <Link
          href="/"
          className="inline-block px-8 py-3 bg-[#fbbf24] text-black rounded-xl font-bold text-lg hover:bg-[#f59e0b] transition-colors"
        >
          🎰 Start Playing
        </Link>
      </div>
    </main>
  );
}
