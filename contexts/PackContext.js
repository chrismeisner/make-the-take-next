// File: /contexts/PackContext.js
import React, {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
  useEffect
} from "react";
import { useSession } from "next-auth/react";

const PackContext = createContext(null);

export function PackContextProvider({ packData, children }) {
  const { data: session } = useSession();

  // We store the verified props in a Set of propIDs
  const [verifiedProps, setVerifiedProps] = useState(new Set());
  // Map of propID to user's take (includes side and takeID)
  const [userTakesByProp, setUserTakesByProp] = useState({});

  // On mount (and whenever session changes), if the user is logged in, 
  // fetch their previously verified takes for this pack.
  useEffect(() => {
	if (!session?.user) return;

	async function fetchUserTakes() {
	  try {
		const res = await fetch("/api/userTakesAll");
		const data = await res.json();
		if (data.success && data.userTakes) {
		  const packPropIDs = new Set(packData.props.map((p) => p.propID));
		  const verifiedFromServer = new Set();
		  const takesMap = {};
		  data.userTakes.forEach((take) => {
			// Only add to verified if it's a prop in this pack
			if (packPropIDs.has(take.propID)) {
			  verifiedFromServer.add(take.propID);
			  takesMap[take.propID] = take;
			}
		  });
		  setVerifiedProps(verifiedFromServer);
		  setUserTakesByProp(takesMap);
		}
	  } catch (err) {
		console.error("[PackContext] Error fetching userTakes:", err);
	  }
	}
	fetchUserTakes();
  }, [session, packData.props]);

  // Called by any PropCard that finishes a VerificationWidget flow
  const handlePropVerified = useCallback((propID) => {
	setVerifiedProps((prevSet) => {
	  const newSet = new Set(prevSet);
	  newSet.add(propID);
	  return newSet;
	});
  }, []);

  // Selected choices: map of propID to chosen side (A/B)
  const [selectedChoices, setSelectedChoices] = useState({});
  // Pre-populate selectedChoices from existing user takes so users can resubmit the same picks
  useEffect(() => {
    if (Object.keys(selectedChoices).length === 0 && Object.keys(userTakesByProp).length > 0) {
      const initialSelections = {};
      for (const [propID, take] of Object.entries(userTakesByProp)) {
        initialSelections[propID] = take.side;
      }
      setSelectedChoices(initialSelections);
    }
  }, [userTakesByProp, selectedChoices]);

  // Handle selecting or toggling a choice for a prop
  const handleChoiceSelect = useCallback((propID, side) => {
    setSelectedChoices((prev) => {
      // If same side clicked again, remove selection
      if (prev[propID] === side) {
        const { [propID]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [propID]: side };
    });
  }, []);

  // Submit all selected takes at once
  const submitAllTakes = useCallback(async () => {
    for (const [propID, side] of Object.entries(selectedChoices)) {
      try {
        const resp = await fetch("/api/take", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ propID, propSide: side }),
        });
        const data = await resp.json();
        if (data.success) {
          // Mark as verified
          setVerifiedProps((prev) => {
            const newSet = new Set(prev);
            newSet.add(propID);
            return newSet;
          });
          // Store the new take record
          setUserTakesByProp((prev) => ({
            ...prev,
            [propID]: { propID, side, takeID: data.newTakeID },
          }));
        } else {
          console.error(`Error submitting take for ${propID}:`, data.error);
        }
      } catch (err) {
        console.error(`Exception submitting take for ${propID}:`, err);
      }
    }
  }, [selectedChoices]);

  // Memoize the context value so children don’t re-render unnecessarily
  const value = useMemo(() => ({
	packData,
	verifiedProps,
	userTakesByProp,
	handlePropVerified,
	selectedChoices,
	handleChoiceSelect,
	submitAllTakes,
  }), [packData, verifiedProps, userTakesByProp, handlePropVerified, selectedChoices, handleChoiceSelect, submitAllTakes]);

  return (
	<PackContext.Provider value={value}>
	  {children}
	</PackContext.Provider>
  );
}

export function usePackContext() {
  return useContext(PackContext);
}
