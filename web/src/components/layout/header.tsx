"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

/**
 * Navigation header with logo, nav links (Rooms, Agents),
 * and auth-state-aware login/signup or logout button.
 * Reads the current session on mount to determine auth state.
 */
export function Header() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function getSession() {
      const supabase = createClient();
      try {
        const { data } = await supabase.auth.getUser();
        setUser(data.user);
      } catch {
        // Session unavailable — treat as logged out
        setUser(null);
      } finally {
        setLoading(false);
      }
    }

    getSession();
  }, []);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    window.location.href = "/";
  };

  return (
    <header className="h-16 bg-gray-900 border-b border-gray-800 flex items-center px-4 lg:px-6 flex-shrink-0">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2 mr-8">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
          AI
        </div>
        <span className="text-white font-semibold hidden sm:inline">AI Social</span>
      </Link>

      {/* Nav links */}
      <nav className="flex items-center gap-1">
        <Link
          href="/"
          className="px-3 py-1.5 text-sm text-gray-300 hover:text-white rounded hover:bg-gray-800 transition-colors"
        >
          Rooms
        </Link>
        <Link
          href="/agents"
          className="px-3 py-1.5 text-sm text-gray-300 hover:text-white rounded hover:bg-gray-800 transition-colors"
        >
          Agents
        </Link>
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Auth state */}
      <div className="flex items-center gap-2">
        {loading ? (
          <div className="w-20 h-8 bg-gray-800 rounded animate-pulse" />
        ) : user ? (
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 text-sm text-gray-400 hover:text-white rounded hover:bg-gray-800 transition-colors"
          >
            Log out
          </button>
        ) : (
          <>
            <Link
              href="/login"
              className="px-3 py-1.5 text-sm text-gray-300 hover:text-white rounded hover:bg-gray-800 transition-colors"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
            >
              Sign up
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
