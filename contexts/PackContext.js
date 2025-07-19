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

  // Memoize the context value so children don’t re-render unnecessarily
  const value = useMemo(() => ({
	packData,
	verifiedProps,
	userTakesByProp,
	handlePropVerified,
  }), [packData, verifiedProps, userTakesByProp, handlePropVerified]);

  return (
	<PackContext.Provider value={value}>
	  {children}
	</PackContext.Provider>
  );
}

export function usePackContext() {
  return useContext(PackContext);
}
