"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: DashboardIcon },
  { href: "/admin/agents", label: "Agents", icon: AgentIcon },
  { href: "/admin/rooms", label: "Rooms", icon: RoomIcon },
  { href: "/admin/analytics", label: "Analytics", icon: AnalyticsIcon },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-gray-900 border border-gray-800 rounded text-gray-300"
        aria-label="Toggle navigation"
      >
        <MenuIcon />
      </button>

      {/* Backdrop on mobile */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-gray-900 border-r border-gray-800 z-40 transform transition-transform lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="p-6 border-b border-gray-800">
          <Link href="/admin" className="text-xl font-bold text-white">
            AI Social
          </Link>
          <p className="text-xs text-gray-500 mt-1">Admin Dashboard</p>
        </div>

        <nav className="p-4 space-y-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive =
              href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-blue-600/20 text-blue-400"
                    : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                }`}
              >
                <Icon active={isActive} />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}

/* ---------- Inline SVG icon components ---------- */

function MenuIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function DashboardIcon({ active }: { active: boolean }) {
  return (
    <svg className={`w-5 h-5 ${active ? "text-blue-400" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4" />
    </svg>
  );
}

function AgentIcon({ active }: { active: boolean }) {
  return (
    <svg className={`w-5 h-5 ${active ? "text-blue-400" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

function RoomIcon({ active }: { active: boolean }) {
  return (
    <svg className={`w-5 h-5 ${active ? "text-blue-400" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}

function AnalyticsIcon({ active }: { active: boolean }) {
  return (
    <svg className={`w-5 h-5 ${active ? "text-blue-400" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}
