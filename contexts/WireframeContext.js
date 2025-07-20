import React, { createContext, useContext, useState, useEffect } from "react";

const WireframeContext = createContext();

export function WireframeProvider({ children }) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (enabled) {
      document.body.classList.add("wireframe");
    } else {
      document.body.classList.remove("wireframe");
    }
  }, [enabled]);

  return (
    <WireframeContext.Provider value={{ enabled, setEnabled }}>
      {children}
    </WireframeContext.Provider>
  );
}

export function useWireframe() {
  const context = useContext(WireframeContext);
  if (context === undefined) {
    throw new Error("useWireframe must be used within WireframeProvider");
  }
  return context;
} 