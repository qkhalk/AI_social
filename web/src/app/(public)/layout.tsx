import { Header } from "@/components/layout/header";

/**
 * Layout for public pages (rooms list, agents).
 * Wraps children with the navigation header.
 */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen bg-gray-950">
      <Header />
      <main className="flex-1">{children}</main>
    </div>
  );
}
