// File: components/PackCarouselView.js

import React, { useState } from "react";
import Link from "next/link";
import CardViewCard from "./CardViewCard";
import { usePackContext } from "../contexts/PackContext";
import CardProgressFooter from "./CardProgressFooter";

export default function PackCarouselView({ packData }) {
  const { props } = packData;
  const [index, setIndex] = useState(0);
  const [fade, setFade] = useState(true);
  const fadeDuration = 500;
  const { verifiedProps } = usePackContext();
  const [showUnansweredOnly, setShowUnansweredOnly] = useState(false);
  const displayedProps = showUnansweredOnly
    ? props.filter((p) => !verifiedProps.has(p.propID))
    : props;

  const prev = () => {
    setFade(false);
    setTimeout(() => {
      setIndex((i) => Math.max(i - 1, 0));
      setTimeout(() => setFade(true), 50);
    }, fadeDuration);
  };

  const next = () => {
    setFade(false);
    setTimeout(() => {
      setIndex((i) => Math.min(i + 1, displayedProps.length - 1));
      setTimeout(() => setFade(true), 50);
    }, fadeDuration);
  };

  if (displayedProps.length === 0) {
    return (
      <p className="text-gray-600">
        {showUnansweredOnly
          ? "No unanswered propositions."
          : "No propositions found for this pack."}
      </p>
    );
  }

  const current = displayedProps[index];

  return (
    <>
      <div className="p-2 flex justify-center">
        <label className="inline-flex items-center space-x-2">
          <input
            type="checkbox"
            checked={showUnansweredOnly}
            onChange={() => {
              setShowUnansweredOnly(!showUnansweredOnly);
              setIndex(0);
            }}
          />
          <span>Only show unanswered props</span>
        </label>
      </div>
      <CardProgressFooter />
      <div className="flex flex-col items-center">
        <div className={`w-full max-w-lg transition-opacity duration-500 ease-in-out ${fade ? "opacity-100" : "opacity-0"}`}>
          <CardViewCard prop={current} />
          <div className="mt-2 text-sm">
            <Link href={`/props/${current.propID}`} className="text-blue-600 underline">
              See prop detail
            </Link>
          </div>
        </div>
        <div className="mt-2 text-sm text-gray-600">
          {index + 1} of {displayedProps.length}
        </div>
        <div className="flex justify-between w-full max-w-lg mt-4">
          <button onClick={prev} disabled={index === 0} className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50">
            Previous
          </button>
          <button onClick={next} disabled={index === displayedProps.length - 1} className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50">
            Next
          </button>
        </div>
        <div className="pb-32" />
      </div>
    </>
  );
} 