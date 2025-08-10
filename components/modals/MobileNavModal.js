// File: components/modals/MobileNavModal.js

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

export default function MobileNavModal({ isOpen, onClose, items = [] }) {
  const router = useRouter();
  const [isEntering, setIsEntering] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    // Lock background scroll
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Trigger enter transition next tick
    const id = requestAnimationFrame(() => setIsEntering(true));
    // Close on Escape
    const onKeyDown = (e) => {
      if (e.key === "Escape") handleRequestClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(id);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRequestClose = () => {
    setIsLeaving(true);
    setTimeout(() => {
      onClose?.();
    }, 300);
  };

  return (
    <div className="fixed inset-0 z-50">
      {/* Overlay */}
      <div
        className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ease-out ${
          isEntering && !isLeaving ? "opacity-100" : "opacity-0"
        }`}
        onClick={handleRequestClose}
      />

      {/* Drawer */}
      <div
        className={`absolute inset-y-0 left-0 w-80 max-w-[85vw] bg-white shadow-xl p-4 flex flex-col transform-gpu transition-transform duration-300 ease-out ${
          isEntering && !isLeaving ? "translate-x-0" : "-translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="font-semibold text-gray-900">Menu</div>
          <button
            className="text-gray-600 text-2xl leading-none px-2"
            onClick={handleRequestClose}
            aria-label="Close menu"
          >
            ×
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto">
          <ul className="space-y-1">
            {items.map((item) => {
              const isActive = router.pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`block px-3 py-2 rounded-md text-base ${
                      isActive
                        ? "bg-gray-200 text-gray-900"
                        : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                    }`}
                    onClick={handleRequestClose}
                  >
                    {item.label}
                  </Link>
                  {item.subItems && router.pathname.startsWith(item.href) && (
                    <ul className="ml-4 mt-1 space-y-1">
                      {item.subItems.map((sub) => {
                        const isSubActive = router.pathname === sub.href;
                        return (
                          <li key={sub.href}>
                            <Link
                              href={sub.href}
                              className={`block px-3 py-2 rounded-md text-sm ${
                                isSubActive
                                  ? "bg-gray-200 text-gray-900"
                                  : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                              }`}
                              onClick={handleRequestClose}
                            >
                              {sub.label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}


