// File: /components/Layout.js
import { useRouter } from "next/router";
import Header from "./Header";

export default function Layout({ children }) {
  const router = useRouter();
  const isHome = router.pathname === "/";

  if (isHome) {
	// If on the homepage => just render children (no header, no container styles)
	return <>{children}</>;
  }

  // Otherwise => original layout (with header, container, padding, etc.)
  return (
	<div className="min-h-screen flex flex-col">
	  <Header />
	  <main className="flex-grow container mx-auto px-4 py-6">
		{children}
	  </main>
	</div>
  );
}
