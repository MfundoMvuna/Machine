"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();

  // Check if user already exists
  const [userId] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("slotUserId") || "";
    }
    return "";
  });

  const [isExistingUser, setIsExistingUser] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [statusType, setStatusType] = useState<"success" | "error" | "">("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userId) {
      // Load existing profile
      fetch(`/api/profile?userId=${userId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.profileName || data.profileEmail) {
            setIsExistingUser(true);
            setProfileName(data.profileName || "");
            setProfileEmail(data.profileEmail || "");
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [userId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus("");

    const trimmedName = profileName.trim();
    const trimmedEmail = profileEmail.trim();

    if (!trimmedName) {
      setStatus("Please enter your name");
      setStatusType("error");
      setSaving(false);
      return;
    }

    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setStatus("Please enter a valid email address");
      setStatusType("error");
      setSaving(false);
      return;
    }

    // Generate userId if new user
    let currentUserId = userId;
    if (!currentUserId) {
      currentUserId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem("slotUserId", currentUserId);
    }

    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUserId,
          profileName: trimmedName,
          profileEmail: trimmedEmail,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save profile");

      setStatus(isExistingUser ? "Profile updated!" : "Account created! Redirecting...");
      setStatusType("success");

      // Redirect to game after a short delay
      setTimeout(() => router.push("/"), 1500);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Something went wrong");
      setStatusType("error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#0f0f23] to-[#0a0a0a] flex items-center justify-center">
        <div className="text-gray-400 animate-pulse text-xl">Loading...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#0f0f23] to-[#0a0a0a] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black bg-gradient-to-r from-[#fbbf24] via-[#f59e0b] to-[#d97706] bg-clip-text text-transparent">
            🎰 {isExistingUser ? "My Account" : "Create Account"}
          </h1>
          <p className="text-gray-500 text-sm mt-2">
            {isExistingUser
              ? "Update your profile details"
              : "Register to start playing and track your winnings"}
          </p>
        </div>

        {/* Form Card */}
        <div className="glass-card p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Name */}
            <div>
              <label
                htmlFor="profileName"
                className="block text-xs text-gray-400 uppercase tracking-wider mb-2 font-bold"
              >
                Player Name
              </label>
              <input
                id="profileName"
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="Enter your name"
                className="w-full rounded-lg bg-[#111427] border border-[#2a2a4a] px-4 py-3 text-gray-200 focus:outline-none focus:border-[#fbbf24] focus:ring-1 focus:ring-[#fbbf24]/30 transition-all"
                maxLength={50}
              />
            </div>

            {/* Email */}
            <div>
              <label
                htmlFor="profileEmail"
                className="block text-xs text-gray-400 uppercase tracking-wider mb-2 font-bold"
              >
                Email Address
              </label>
              <input
                id="profileEmail"
                type="email"
                value={profileEmail}
                onChange={(e) => setProfileEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg bg-[#111427] border border-[#2a2a4a] px-4 py-3 text-gray-200 focus:outline-none focus:border-[#fbbf24] focus:ring-1 focus:ring-[#fbbf24]/30 transition-all"
                maxLength={100}
              />
            </div>

            {/* User ID (read-only for existing users) */}
            {isExistingUser && userId && (
              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2 font-bold">
                  User ID
                </label>
                <div className="w-full rounded-lg bg-[#0a0a1a] border border-[#1a1a3a] px-4 py-3 text-gray-600 font-mono text-xs break-all">
                  {userId}
                </div>
              </div>
            )}

            {/* Status Message */}
            {status && (
              <div
                className={`p-3 rounded-lg text-sm font-bold text-center ${
                  statusType === "success"
                    ? "bg-green-500/20 text-green-400"
                    : "bg-red-500/20 text-red-400"
                }`}
              >
                {status}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 bg-gradient-to-r from-[#fbbf24] to-[#f59e0b] text-black rounded-lg font-black text-sm uppercase tracking-wider hover:from-[#f59e0b] hover:to-[#d97706] transition-all disabled:opacity-50 shadow-lg shadow-yellow-500/20"
            >
              {saving
                ? "Saving..."
                : isExistingUser
                ? "Update Profile"
                : "Create Account & Play"}
            </button>
          </form>

          {/* Links */}
          <div className="mt-6 flex items-center justify-between text-sm">
            <Link href="/" className="text-gray-500 hover:text-[#fbbf24] transition-colors">
              {isExistingUser ? "← Back to Game" : "Skip for now →"}
            </Link>
            {isExistingUser && (
              <Link
                href="/transactions"
                className="text-gray-500 hover:text-[#fbbf24] transition-colors"
              >
                View Transactions
              </Link>
            )}
          </div>
        </div>

        {/* Info */}
        <p className="text-center text-gray-700 text-xs mt-6">
          🔒 Your information is stored securely and never shared with third parties
        </p>
      </div>
    </main>
  );
}
