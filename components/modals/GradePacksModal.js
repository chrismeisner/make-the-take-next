import React from "react";
import GlobalModal from "./GlobalModal";
import Link from "next/link";

export default function GradePacksModal({ isOpen, onClose, packs = [] }) {
  const sortedPacks = React.useMemo(() => [...packs].sort((a, b) => new Date(b.eventTime) - new Date(a.eventTime)), [packs]);
  return (
    <GlobalModal isOpen={isOpen} onClose={onClose}>
      <div className="p-4">
        <h2 className="text-2xl font-bold mb-4">Packs to Grade</h2>
        {sortedPacks.length > 0 ? (
          <ul className="list-disc list-inside space-y-2">
            {sortedPacks.map((pack) => (
              <li key={pack.airtableId} className="flex justify-between items-center">
                <div>
                  <div className="font-medium">{pack.packTitle}</div>
                  <div className="text-sm text-gray-600">
                    Event Time: {new Date(pack.eventTime).toLocaleString()}
                  </div>
                </div>
                <Link href={`/admin/grade/${pack.packURL}`}>
                  <button
                    onClick={onClose}
                    className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    Grade
                  </button>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-600">No packs available to grade.</p>
        )}
        <div className="flex justify-end mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    </GlobalModal>
  );
} 