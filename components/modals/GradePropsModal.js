import React, { useState, useMemo } from "react";
import GlobalModal from "./GlobalModal";
import { useRouter } from "next/router";

export default function GradePropsModal({ isOpen, onClose, props = [] }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const router = useRouter();

  const sortedProps = useMemo(() => {
    return [...props].sort((a, b) => new Date(b.propEventTimeLookup) - new Date(a.propEventTimeLookup));
  }, [props]);

  const allSelected = sortedProps.length > 0 && selectedIds.length === sortedProps.length;

  const handleCheck = (propID) => {
    setSelectedIds((prev) =>
      prev.includes(propID) ? prev.filter((x) => x !== propID) : [...prev, propID]
    );
  };

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(sortedProps.map((p) => p.propID));
    }
  };

  const handleNext = () => {
    if (selectedIds.length === 0) return;
    const idsParam = encodeURIComponent(selectedIds.join(","));
    onClose();
    router.push(`/admin/gradeProps?ids=${idsParam}`);
  };

  const renderEventCell = (p) => {
    const league = p.propLeagueLookup ? String(p.propLeagueLookup).toLowerCase() : null;
    if (league && p.propESPNLookup) {
      return (
        <a
          href={`https://www.espn.com/${league}/boxscore/_/gameId/${p.propESPNLookup}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 underline"
        >
          {p.propEventMatchup || "View Game"}
        </a>
      );
    }
    return p.propEventMatchup || "";
  };

  const renderEventTime = (t) => {
    if (!t) return "";
    try {
      const date = new Date(t);
      return new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(date);
    } catch {
      return new Date(t).toLocaleString();
    }
  };

  return (
    <GlobalModal isOpen={isOpen} onClose={onClose} className="max-w-5xl">
      <div className="p-4">
        <h2 className="text-2xl font-bold mb-4">Props to Grade</h2>
        {sortedProps.length > 0 ? (
          <div className="overflow-y-auto max-h-[70vh]">
            <table className="w-full table-auto">
              <thead>
                <tr>
                  <th className="px-2">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={handleSelectAll}
                    />
                  </th>
                  <th className="text-left">Question</th>
                  <th className="text-left">Event</th>
                  <th className="text-left">Event Time</th>
                </tr>
              </thead>
              <tbody>
                {sortedProps.map((p) => (
                  <tr key={p.airtableId} className="border-t">
                    <td className="px-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(p.propID)}
                        onChange={() => handleCheck(p.propID)}
                      />
                    </td>
                    <td className="py-2">{p.propShort}</td>
                    <td className="py-2">{renderEventCell(p)}</td>
                    <td className="py-2">{renderEventTime(p.propEventTimeLookup)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-600">No props available to grade.</p>
        )}
        <div className="flex justify-end mt-4 space-x-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Close
          </button>
          <button
            onClick={handleNext}
            disabled={selectedIds.length === 0}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </GlobalModal>
  );
}
