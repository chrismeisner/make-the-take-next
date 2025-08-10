export default function PageContainer({ size = "default", className = "", children }) {
  const widthClass =
    size === "narrow" ? "max-w-4xl" :
    size === "wide" ? "max-w-7xl" :
    "max-w-7xl";
  return (
    <div className={`${widthClass} w-full mx-auto ${className}`}>
      {children}
    </div>
  );
}


