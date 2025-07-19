// File: components/PackListView.js

import React, { useEffect, useState } from "react";
import Link from "next/link";
import ListProgressFooter from "./ListProgressFooter";
import PropCard from "./PropCard";
import { usePackContext } from "../contexts/PackContext";

export default function PackListView({ packData, leaderboard, debugLogs }) {
  const { props, packTitle, packCover, packPrize, packPrizeImage, prizeSummary, packPrizeURL, eventTime, contentData, contests } = packData;
  const [timeLeft, setTimeLeft] = useState("");

  // Copy countdown logic from PackInner
  useEffect(() => {
    if (!eventTime) return;
    const endTime = new Date(eventTime).getTime();
    function update() {
      const diff = endTime - Date.now();
      if (diff <= 0) {
        setTimeLeft("Event Started or Ended!");
        return;
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);
      setTimeLeft(
        `${days > 0 ? days + "d " : ""}${hours > 0 ? hours + "h " : ""}${minutes > 0 || hours > 0 || days > 0 ? minutes + "m " : ""}${seconds}s`
      );
    }
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [eventTime]);

  return (
    <>
      <ListProgressFooter />
      <div className="p-4 max-w-4xl mx-auto">
        {eventTime && (
          <div className="text-center mb-4 p-2 bg-yellow-50 border border-yellow-200 rounded">
            <h2 className="text-lg font-semibold mb-1">Event Countdown</h2>
            <p className="text-xl font-bold text-red-600">{timeLeft}</p>
            <p className="text-sm text-gray-600">
              Event Time: {new Date(eventTime).toLocaleString()}
            </p>
          </div>
        )}

        {contests.length > 0 && (
          <section className="mb-6">
            <h2 className="text-xl font-bold mb-2">Contests for This Pack</h2>
            <ul className="list-disc list-inside">
              {contests.map((c) => (
                <li key={c.airtableId} className="mb-2">
                  <Link href={`/contests/${c.contestID}`} className="text-blue-600 underline">
                    {c.contestTitle}
                  </Link>
                  {c.contestPrize && (
                    <p className="text-sm text-green-600 mt-1">Prize: {c.contestPrize}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* List View of Props */}
        {props.length === 0 ? (
          <p className="text-gray-600">No propositions found for this pack.</p>
        ) : (
          <div className="space-y-6">
            {props.map((prop) => (
              <div key={prop.propID} className="relative">
                <PropCard prop={prop} />
                <div className="mt-2 text-sm">
                  <Link href={`/props/${prop.propID}`} className="text-blue-600 underline">
                    See prop detail
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Leaderboard */}
        {leaderboard && (
          <div className="mt-8 pt-4 border-t border-gray-300">
            <h2 className="text-xl font-bold mb-2">Leaderboard for This Pack</h2>
            {/* existing PackLeaderboard rendering could go here or be passed as prop */}
          </div>
        )}

        <div className="pb-32" />
      </div>
    </>
  );
} 