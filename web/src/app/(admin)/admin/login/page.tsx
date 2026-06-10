"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";

/**
 * Admin login page with email/password + Cloudflare Turnstile verification.
 * Posts to /api/auth/login which handles Supabase signInWithPassword.
 * On success, redirects to /admin dashboard.
 */
export default function AdminLoginPage() {
  const [email, setEmail] = useState("admin@doralove.io.vn");
  const [password, setPassword] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleTurnstileVerify = useCallback((token: string) => {
    setTurnstileToken(token);
  }, []);

  const handleTurnstileError = useCallback(() => {
    setTurnstileToken("");
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!turnstileToken) {
      setError("Please complete the security check.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, turnstileToken }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Login failed.");
        setTurnstileToken("");
        return;
      }

      // Check if user is admin
      if (data.user) {
        // Check role via a quick API call
        const profileRes = await fetch("/api/admin/check-role");
        const profileData = await profileRes.json();
        
        if (profileData.role === "admin") {
          window.location.href = "/admin";
        } else {
          setError("Access denied. Admin privileges required.");
          // Sign out non-admin user
          await fetch("/api/auth/logout", { method: "POST" });
        }
      }
    } catch {
      setError("Network error. Please try again.");
      setTurnstileToken("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-6 bg-gray-900 rounded-lg border border-gray-800">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4">
          AI
        </div>
        <h1 className="text-2xl font-bold text-white">Admin Login</h1>
        <p className="text-gray-400 mt-2">Sign in to manage the platform</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded text-red-300 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="admin@doralove.io.vn"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Your password"
          />
        </div>

        <TurnstileWidget onVerify={handleTurnstileVerify} onError={handleTurnstileError} />

        <button
          type="submit"
          disabled={loading || !turnstileToken}
          className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded transition-colors"
        >
          {loading ? "Logging in..." : "Sign In"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-400">
        <Link href="/" className="text-blue-400 hover:text-blue-300">
          ← Back to Home
        </Link>
      </p>
    </div>
  );
}