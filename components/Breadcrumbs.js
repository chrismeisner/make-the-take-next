import Link from "next/link";
import Head from "next/head";

/**
 * Breadcrumbs component
 * - Accessible: nav[aria-label="Breadcrumb"], ordered list, aria-current on last item
 * - Reusable across pages: pass an array of items: [{ name, href? }]; last item is current page
 * - SEO: emits JSON-LD for BreadcrumbList
 */
export default function Breadcrumbs({ items = [] }) {
  if (!Array.isArray(items) || items.length === 0) return null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: item?.name || "",
      item: item?.href || undefined,
    })),
  };

  return (
    <>
      <Head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </Head>
      <nav aria-label="Breadcrumb" className="mb-4">
        <ol className="flex flex-wrap items-center gap-1 text-sm text-gray-600">
          {items.map((item, idx) => {
            const isLast = idx === items.length - 1;
            return (
              <li key={idx} className="flex items-center">
                {isLast || !item.href ? (
                  <span aria-current={isLast ? "page" : undefined} className={isLast ? "font-medium text-gray-900" : undefined}>
                    {item.name}
                  </span>
                ) : (
                  <Link href={item.href} className="hover:text-gray-900 underline">
                    {item.name}
                  </Link>
                )}
                {!isLast && <span className="mx-2 text-gray-400">/</span>}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}


