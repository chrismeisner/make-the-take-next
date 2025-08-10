import { useRouter } from "next/router";
import { useState, useEffect } from "react";
import Link from "next/link";
import PageContainer from "../../../components/PageContainer";

export default function ExchangesPage() {
  const router = useRouter();
  const { profileID } = router.query;
  const [userExchanges, setUserExchanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!profileID) return;
    async function fetchExchanges() {
      try {
        const res = await fetch(`/api/profile/${encodeURIComponent(profileID)}`);
        const data = await res.json();
        if (data.success) {
          setUserExchanges(data.userExchanges || []);
        } else {
          setError(data.error || "Error loading exchanges");
        }
      } catch (err) {
        console.error("Error fetching exchanges:", err);
        setError("Error fetching exchanges");
      } finally {
        setLoading(false);
      }
    }
    fetchExchanges();
  }, [profileID]);

  if (loading) return <div className="p-4">Loading exchanges...</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;

  return (
    <PageContainer>
      <h2 className="text-2xl font-bold mb-4">Exchanges</h2>
      {userExchanges.length === 0 ? (
        <p className="text-center">No exchanges yet.</p>
      ) : (
        <ul className="list-disc list-inside text-sm">
          {userExchanges.map((ex) => (
            <li key={ex.exchangeID}>
              Spent {ex.exchangeTokens} tokens on {ex.exchangeItem.join(', ')} on {new Date(ex.createdTime).toLocaleString()}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4">
        <Link href={`/profile/${profileID}`} className="underline text-blue-600">
          Back to Profile
        </Link>
      </p>
    </PageContainer>
  );
}
