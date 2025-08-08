import Airtable from "airtable";
import Link from "next/link";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default function ProfileAwardsPage({ profileID, profileUsername, winnerPacks = [] }) {
  return (
    <div className="p-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">{profileUsername ? `@${profileUsername}` : profileID} Awards</h1>
        <Link href={`/profile/${encodeURIComponent(profileID)}`} className="underline text-blue-600">
          Back to Profile
        </Link>
      </div>

      {winnerPacks.length === 0 ? (
        <p className="text-gray-700">No awards yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {winnerPacks.map((p) => (
            <Link key={p.packID || p.airtableId} href={`/packs/${p.packURL}`} className="block border rounded shadow-sm bg-white overflow-hidden">
              <div className="aspect-square w-full bg-gray-100 relative" style={{ backgroundImage: p.packCover ? `url(${p.packCover})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center' }}>
                {!p.packCover && (
                  <div className="absolute inset-0 flex items-center justify-center text-gray-500">No Cover</div>
                )}
              </div>
              <div className="p-3">
                <h2 className="font-semibold text-base mb-1">{p.packTitle || p.packURL || 'Untitled Pack'}</h2>
                <div className="text-xs text-gray-600">{p.eventTime ? new Date(p.eventTime).toLocaleString() : ''}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export async function getServerSideProps({ params }) {
  const { profileID } = params;
  try {
    // Resolve the profile record by profileID to get record id and username
    const profs = await base('Profiles')
      .select({ filterByFormula: `{profileID}="${profileID}"`, maxRecords: 1 })
      .firstPage();
    if (profs.length === 0) {
      return { notFound: true };
    }
    const profileRecord = profs[0];
    const profileRecordId = profileRecord.id;
    const profileUsername = profileRecord.fields.profileUsername || null;

    // Find packs where this profile is the winner and pack is graded
    const winnerFormula = `OR(AND(LOWER({packStatus})='graded', {winnerProfileID}='${profileID}'), AND(LOWER({packStatus})='graded', FIND('${profileRecordId}', ARRAYJOIN({packWinner}))>0))`;
    const packRecords = await base('Packs')
      .select({ filterByFormula: winnerFormula, maxRecords: 5000 })
      .all();

    const winnerPacks = packRecords.map((rec) => {
      const f = rec.fields || {};
      const coverUrl = Array.isArray(f.packCover) && f.packCover.length > 0 ? f.packCover[0].url : null;
      return {
        airtableId: rec.id,
        packID: f.packID || rec.id,
        packURL: f.packURL || '',
        packTitle: f.packTitle || '',
        packCover: coverUrl,
        eventTime: f.eventTime || null,
      };
    });

    // Sort by event time desc if present, else by created time desc
    winnerPacks.sort((a, b) => {
      const at = a.eventTime ? new Date(a.eventTime).getTime() : 0;
      const bt = b.eventTime ? new Date(b.eventTime).getTime() : 0;
      return bt - at;
    });

    return { props: { profileID, profileUsername, winnerPacks } };
  } catch (err) {
    console.error('[Awards page] Error:', err);
    return { notFound: true };
  }
}


