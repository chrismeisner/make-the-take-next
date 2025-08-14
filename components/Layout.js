// File: /components/Layout.js
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import Header from "./Header";
import SidebarNav from "./SidebarNav";
import Footer from "./Footer";

export default function Layout({ children }) {
  const { data: session } = useSession();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const profileID = session?.user?.profileID;
  const isSuperAdmin = Boolean(session?.user?.superAdmin);
  const sidebarItems = [
    { label: "Dashboard", href: "/" },
    { label: "Packs", href: "/packs" },
    { label: "Marketplace", href: "/marketplace" },
    { label: "Contests", href: "/contests" },
    { label: "Leaderboard", href: "/leaderboard" },
    ...(profileID ? [{ label: "Profile", href: `/profile/${profileID}` }] : []),
    {
      label: "Admin",
      href: "/admin",
      subItems: [
        { label: "Events", href: "/admin/events" },
        { label: "Contests", href: "/admin/contests" },
        { label: "Packs", href: "/admin/packs" },
      ],
    },
  ];

  // Initialize collapsed state from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed");
    if (stored !== null) {
      setCollapsed(stored === "true");
    }
  }, []);

  // Persist collapsed state
  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", collapsed);
  }, [collapsed]);

  // Otherwise => original layout (with header, container, padding, etc.)
  return (
    <div className="h-screen flex">
      {session?.user && isSuperAdmin ? (
        <SidebarNav items={sidebarItems} collapsed={collapsed} setCollapsed={setCollapsed} />
      ) : null}
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        <Header collapsed={collapsed} setCollapsed={setCollapsed} sidebarItems={sidebarItems} />
        <main className="flex-1 overflow-x-hidden overflow-y-auto max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>
        <Footer />
      </div>
    </div>
  );
}
