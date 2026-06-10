import { Sidebar } from "@/components/admin/sidebar";

/**
 * Admin layout: sidebar nav + main content area.
 * Route protection is handled by middleware — this layout only provides UI shell.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-950">
      <Sidebar />
      {/* Offset for fixed sidebar on desktop */}
      <main className="lg:ml-64 p-6 lg:p-8 pt-16 lg:pt-8">
        {children}
      </main>
    </div>
  );
}
