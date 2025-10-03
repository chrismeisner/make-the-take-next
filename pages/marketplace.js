import React from 'react';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import MarketplacePreview from '../components/MarketplacePreview';
import { useRouter } from 'next/router';
import Link from 'next/link';

export default function MarketplacePage() {
  const router = useRouter();
  const teamSlug = typeof router.query?.teamSlug === 'string' ? router.query.teamSlug : '';
  const isTeamView = Boolean(teamSlug);
  const subtitle = isTeamView
    ? `Team marketplace for ${teamSlug.toUpperCase()} — redeem prizes themed for this team when available.`
    : 'Browse available items you can redeem with tokens.';
  return (
    <Layout>
      <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
        <PageHeader title="Marketplace" subtitle={subtitle} />
        {isTeamView && (
          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded text-blue-900">
            Make {teamSlug.toUpperCase()} takes to win prizes. Explore team items below, or <Link href="/marketplace" className="underline">view all</Link>.
          </div>
        )}
        <div className="mt-6">
          <MarketplacePreview limit={24} title={isTeamView ? 'Team Rewards' : 'Available Rewards'} variant="default" preferFeatured={false} />
        </div>
        {isTeamView && (
          <TeamPacksSection teamSlug={teamSlug} />
        )}
      </div>
    </Layout>
  );
}

function TeamPacksSection({ teamSlug }) {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [packs, setPacks] = React.useState([]);
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/packs/byTeam?teamSlug=${encodeURIComponent(teamSlug)}`);
        const data = await res.json();
        if (!mounted) return;
        if (res.ok && data.success) {
          setPacks(Array.isArray(data.packs) ? data.packs : []);
        } else {
          setError(data.error || 'Failed to load team packs');
        }
      } catch (e) {
        if (!mounted) return;
        setError('Error fetching team packs');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [teamSlug]);

  if (loading) return null;
  if (error) return null;
  if (!packs || packs.length === 0) return null;

  return (
    <div className="mt-10">
      <h3 className="text-xl font-semibold mb-3">{teamSlug.toUpperCase()} Packs</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {packs.map((p) => (
          <a key={p.id} href={`/packs/${encodeURIComponent(p.pack_url)}`} className="block bg-white border rounded shadow-sm overflow-hidden hover:shadow">
            {p.cover_url ? (
              <div className="w-full bg-gray-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.cover_url} alt={p.title || 'Pack'} className="w-full h-auto object-contain" />
              </div>
            ) : null}
            <div className="p-3">
              <div className="text-sm text-gray-500">{p.pack_status}</div>
              <div className="text-base font-semibold">{p.title}</div>
              {p.event_time ? (
                <div className="text-xs text-gray-600 mt-1">Event: {new Date(p.event_time).toLocaleString()}</div>
              ) : null}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}


