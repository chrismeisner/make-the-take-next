import Breadcrumbs from "./Breadcrumbs";
import PageContainer from "./PageContainer";

export default function PageHeader({ title, breadcrumbs, actions = null, size = "default", className = "" }) {
  const hasBreadcrumbs = Array.isArray(breadcrumbs) && breadcrumbs.length > 0;
  return (
    <PageContainer size={size} className={`mb-4 ${className}`}>
      {hasBreadcrumbs ? (
        <div className="flex items-start justify-between">
          <Breadcrumbs items={breadcrumbs} />
          {actions}
        </div>
      ) : null}

      {(!hasBreadcrumbs && (title || actions)) && (
        <div className="flex items-start justify-between">
          {title && (
            <h1 className="text-2xl font-bold">{title}</h1>
          )}
          {actions}
        </div>
      )}
    </PageContainer>
  );
}


