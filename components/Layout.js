// File: /components/Layout.js
import { useRouter } from "next/router";
import Header from "./Header";
import Footer from "./Footer";

export default function Layout({ children }) {
  const router = useRouter();
  const isHome = router.pathname === "/";

  if (isHome) {
    // Homepage: full-height flex layout without header/container but with footer
    return (
      <div className="min-h-screen flex flex-col">
        <main className="flex-grow">
          {children}
        </main>
        <Footer />
      </div>
    );
  }

  // Otherwise => original layout (with header, container, padding, etc.)
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-grow container mx-auto px-4 py-6">
        {children}
      </main>
      {/* Global footer component for sticky bottom when needed */}
      <Footer />
    </div>
  );
}
