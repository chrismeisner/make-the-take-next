import PackPreview from './PackPreview';

export default function PackExplorer({ packs = [] }) {
  return (
    <div>
      {packs.length > 0 ? (
        <div className="w-full flex flex-col gap-4">
          {packs.map((pack) => (
            <PackPreview key={pack.packID || pack.airtableId || pack.id} pack={pack} />
          ))}
        </div>
      ) : (
        <p className="text-center">No packs to show</p>
      )}
    </div>
  );
}
