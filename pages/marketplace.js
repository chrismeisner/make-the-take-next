import React from 'react';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import MarketplacePreview from '../components/MarketplacePreview';

export default function MarketplacePage() {
  return (
    <Layout>
      <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
        <PageHeader title="Marketplace" subtitle="Browse available items you can redeem with tokens." />
        <div className="mt-6">
          <MarketplacePreview limit={24} title="Available Rewards" variant="default" preferFeatured={false} />
        </div>
      </div>
    </Layout>
  );
}


