import { useState, useMemo } from "react";
import Link from "next/link";
import PageContainer from "../../components/PageContainer";
import PageHeader from "../../components/PageHeader";

export default function AdminCalculatorPage() {
  const [moneylineInput, setMoneylineInput] = useState("");
  const [percentInput, setPercentInput] = useState("");

  function parseMoneyline(raw) {
    if (raw === null || raw === undefined) return null;
    const s = String(raw).trim();
    if (!s) return null;
    // Accept optional +/-, commas, and whitespace
    const normalized = s.replace(/[,\s]/g, "");
    const n = Number(normalized);
    if (!Number.isFinite(n)) return null;
    if (n === 0) return null;
    return n;
  }

  const impliedProbability = useMemo(() => {
    const ml = parseMoneyline(moneylineInput);
    if (ml === null) return null;
    let p;
    if (ml > 0) {
      p = 100 / (ml + 100);
    } else {
      p = -ml / (-ml + 100);
    }
    if (!Number.isFinite(p)) return null;
    return p;
  }, [moneylineInput]);

  const percentageText = useMemo(() => {
    if (impliedProbability === null) return "";
    return `${(impliedProbability * 100).toFixed(2)}%`;
  }, [impliedProbability]);

  function parsePercent(raw) {
    if (raw === null || raw === undefined) return null;
    const s = String(raw).trim();
    if (!s) return null;
    const normalized = s.replace(/[,%\s]/g, "");
    const n = Number(normalized);
    if (!Number.isFinite(n)) return null;
    // Allow values in [0,1] or [0,100]
    const p = n > 1 ? n / 100 : n;
    if (!(p > 0 && p < 1)) return null;
    return p;
  }

  const impliedMoneyline = useMemo(() => {
    const p = parsePercent(percentInput);
    if (p === null) return null;
    if (Math.abs(p - 0.5) < 1e-9) return 100; // convention: +100 at 50%
    if (p > 0.5) {
      const L = (p * 100) / (1 - p);
      const ml = -Math.round(L);
      return ml;
    } else {
      const L = (100 * (1 - p)) / p;
      const ml = Math.round(L);
      return ml;
    }
  }, [percentInput]);

  const moneylineText = useMemo(() => {
    if (impliedMoneyline === null) return "";
    const ml = impliedMoneyline;
    return ml > 0 ? `+${ml}` : String(ml);
  }, [impliedMoneyline]);

  return (
    <div className="p-4">
      <PageHeader title="Calculator" />
      <PageContainer>
        <section className="border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-2">Moneyline → Implied Probability</h2>
          <p className="text-sm text-gray-600 mb-3">
            Enter a moneyline (e.g. -120 or +150) to compute implied probability.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Moneyline</label>
              <input
                type="text"
                inputMode="numeric"
                value={moneylineInput}
                onChange={(e) => setMoneylineInput(e.target.value)}
                placeholder="-120"
                className="px-3 py-2 border rounded w-40"
              />
            </div>
            <div className="pb-2 text-sm text-gray-700">Implied Probability</div>
            <div className="pb-2 text-base font-semibold">{percentageText || "—"}</div>
          </div>
          <div className="mt-3 text-xs text-gray-500">
            Formula: for positive lines +L, p = 100 / (L + 100); for negative lines −L, p = L / (L + 100) where L = |moneyline|.
          </div>
          <div className="mt-4">
            <Link href="/admin" className="text-sm text-blue-600 hover:underline">Back to Admin</Link>
          </div>
        </section>

        <section className="border rounded-lg p-4 mt-4">
          <h2 className="text-lg font-semibold mb-2">Implied Probability → Moneyline</h2>
          <p className="text-sm text-gray-600 mb-3">
            Enter a probability (e.g. 60 or 0.6) to compute the implied American moneyline.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Probability</label>
              <input
                type="text"
                inputMode="decimal"
                value={percentInput}
                onChange={(e) => setPercentInput(e.target.value)}
                placeholder="60 or 0.6"
                className="px-3 py-2 border rounded w-40"
              />
            </div>
            <div className="pb-2 text-sm text-gray-700">Implied Moneyline</div>
            <div className="pb-2 text-base font-semibold">{moneylineText || "—"}</div>
          </div>
          <div className="mt-3 text-xs text-gray-500">
            Formula: for p &gt; 0.5, moneyline = −(100·p)/(1−p); for p &lt; 0.5, moneyline = (100·(1−p))/p. At p = 0.5, moneyline = +100.
          </div>
        </section>
      </PageContainer>
    </div>
  );
}


