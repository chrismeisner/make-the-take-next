// File: /components/Layout.js
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Header from "./Header";
import SidebarNav from "./SidebarNav";
import Footer from "./Footer";

export default function Layout({ children }) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

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
  const sidebarItems = [
    { label: "Dashboard", href: "/" },
    { label: "Admin", href: "/admin" },
  ];

  // Otherwise => original layout (with header, container, padding, etc.)
  return (
    <div className="h-screen flex">
      <SidebarNav items={sidebarItems} collapsed={collapsed} setCollapsed={setCollapsed} />
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        <Header collapsed={collapsed} setCollapsed={setCollapsed} />
        <main className="flex-1 overflow-x-hidden overflow-y-auto max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>
        <Footer />
      </div>
    </div>
  );
}
