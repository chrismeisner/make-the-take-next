import React from "react";

export default function Footer() {
  const currentYear = new Date().getFullYear();
  return (
    <footer className="bg-white border-t border-gray-200 w-full">
      <div className="max-w-7xl mx-auto px-4 py-4 text-center text-sm text-gray-500">
        © {currentYear} Make The Take. All rights reserved.
      </div>
    </footer>
  );
} 