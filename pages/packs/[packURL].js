// File: pages/packs/[packURL].js

// Redirect default pack URL to the list view
export async function getServerSideProps({ params }) {
  const { packURL } = params;
  return {
    redirect: {
      destination: `/packs/${encodeURIComponent(packURL)}/list`,
      permanent: false,
    },
  };
}

export default function PackPage() {
  // This page redirects to the list view
  return null;
}
