import React, { useState, useEffect } from "react";

export default function Toast({ message, duration = 3000, onClose }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) return;
    setVisible(true);
    const hideTimer = setTimeout(() => setVisible(false), duration);
    const removeTimer = setTimeout(() => { onClose && onClose(); }, duration + 300);
    return () => {
      clearTimeout(hideTimer);
      clearTimeout(removeTimer);
    };
  }, [message, duration, onClose]);

  if (!message) return null;

  return (
    <div className={`fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-green-600 text-white px-6 py-3 rounded shadow-lg z-50 transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}>
      {message}
    </div>
  );
} 