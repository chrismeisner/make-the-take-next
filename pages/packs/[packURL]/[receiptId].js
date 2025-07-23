import React, { useState } from 'react';
import Link from 'next/link';
import Airtable from 'airtable';

export async function getServerSideProps(context) {
  const { packURL, receiptId } = context.params;
  const proto = context.req.headers['x-forwarded-proto'] || 'http';
  const host = context.req.headers['x-forwarded-host'] || context.req.headers.host;
  const origin = process.env.SITE_URL || `${proto}://${host}`;

  // Fetch pack data via internal API
  const packRes = await fetch(`${origin}/api/packs/${encodeURIComponent(packURL)}`);
  const packJson = await packRes.json();
  if (!packRes.ok || !packJson.success) {
    return { notFound: true };
  }
  const packData = packJson.pack;

  // Fetch takes by receiptId
  const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
  const takeRecords = await base('Takes').select({
    filterByFormula: `{receiptID} = "${receiptId}"`,
    maxRecords: 1000,
  }).all();

  const takes = takeRecords
    .map((rec) => ({
      id: rec.id,
      propID: rec.fields.propID,
      propSide: rec.fields.propSide,
      takeTime: rec._rawJson.createdTime,
      profileID: rec.fields.profileID || null,
    }))
    .filter((take) => packData.props.some((p) => p.propID === take.propID))
    .sort((a, b) => new Date(a.takeTime) - new Date(b.takeTime));

  // Fetch profile info for this receipt (if available)
  let profileData = null;
  if (takes.length > 0 && takes[0].profileID) {
    const profileRes = await fetch(
      `${origin}/api/profile/${encodeURIComponent(takes[0].profileID)}`
    );
    const profileJson = await profileRes.json();
    if (profileRes.ok && profileJson.success) {
      profileData = profileJson.profile;
    }
  }

  return {
    props: {
      packData,
      takes,
      receiptId,
      origin,
      profileData,
    },
  };
}

export default function PackReceiptPage({ packData, takes, receiptId, origin, profileData }) {
  // build share URL and setup copy state/handlers
  const shareUrl = `${origin}/packs/${packData.packURL}?ref=${receiptId}`;
  const [copied, setCopied] = useState(false);
  const fallbackCopyTextToClipboard = (text) => {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
    document.body.appendChild(textArea);
    textArea.select();
    try { document.execCommand('copy'); } catch (err) { console.error('Fallback: unable to copy', err); }
    document.body.removeChild(textArea);
  };
  const handleCopy = async () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try { await navigator.clipboard.writeText(shareUrl); } catch { fallbackCopyTextToClipboard(shareUrl); }
    } else {
      fallbackCopyTextToClipboard(shareUrl);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="p-4 max-w-lg mx-auto">
      {/* Pack preview with link */}
      <Link
        href={`/packs/${packData.packURL}/cards`}
        className="mb-6 flex items-center p-4 border rounded hover:bg-gray-50"
      >
        {packData.packCover?.[0]?.url && (
          <img
            src={packData.packCover[0].url}
            alt={packData.packTitle}
            className="w-16 h-16 object-cover rounded mr-4"
          />
        )}
        <div>
          <p className="text-xl font-semibold text-blue-600">
            {packData.packTitle}
          </p>
          <p className="text-gray-600">{packData.packSummary}</p>
        </div>
      </Link>
      {profileData && (
        <div className="mb-4 p-4 border rounded bg-gray-50">
          {profileData.profileAvatar?.[0]?.url && (
            <img
              src={profileData.profileAvatar[0].url}
              alt="User Avatar"
              className="h-12 w-12 rounded-full mb-2"
            />
          )}
          <p><strong>User:</strong> {profileData.profileUsername || profileData.profileID}</p>
          <p><strong>Phone:</strong> {profileData.profileMobile}</p>
          {profileData.profileTeamData?.teamName && (
            <p><strong>Favorite Team:</strong> {profileData.profileTeamData.teamName}</p>
          )}
        </div>
      )}
      <h1 className="text-2xl font-bold mb-4">Receipt for {packData.packTitle}</h1>
      <div className="mb-4 break-all flex items-center">
        <span className="mr-2">Shareable URL:</span>
        <a
          href={shareUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 underline break-all"
        >{shareUrl}</a>
        <button
          type="button"
          onClick={handleCopy}
          className="ml-2 px-3 py-1 bg-blue-600 text-white text-sm rounded"
        >
          {copied ? 'Copied!' : 'Copy Link'}
        </button>
      </div>
      <ul className="space-y-4">
        {takes.map((take) => {
          const prop = packData.props.find((p) => p.propID === take.propID);
          return (
            <li key={take.id} className="border p-2 rounded">
              <div className="font-semibold">
                {prop?.propShort || prop?.propTitle || take.propID}
              </div>
              <div>
                Your answer:{' '}
                <strong>{take.propSide}</strong>
              </div>
              <div className="text-sm text-gray-500">
                {new Date(take.takeTime).toLocaleString()}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
} 