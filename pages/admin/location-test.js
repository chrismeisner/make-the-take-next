import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export default function AdminLocationTestPage() {
  const [permission, setPermission] = useState("unknown");
  const [geoLoading, setGeoLoading] = useState(false);
  const [position, setPosition] = useState(null);
  const [geoError, setGeoError] = useState(null);

  const [ipLoading, setIpLoading] = useState(false);
  const [ipResult, setIpResult] = useState(null);
  const [ipError, setIpError] = useState(null);

  const [networkInfo, setNetworkInfo] = useState(null);
  const [tz, setTz] = useState("");
  const [locale, setLocale] = useState("");
  const [memory, setMemory] = useState(null);
  const [secureContext, setSecureContext] = useState(null);

  const watchIdRef = useRef(null);

  useEffect(() => {
    if (typeof Intl !== "undefined" && Intl.DateTimeFormat) {
      setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || "");
      try {
        setLocale(navigator.language || "");
      } catch {}
    }
    try {
      // Network Information API (not standardized everywhere)
      const nav = navigator;
      const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
      if (conn) {
        setNetworkInfo({
          downlink: conn.downlink,
          effectiveType: conn.effectiveType,
          rtt: conn.rtt,
          saveData: !!conn.saveData,
        });
      }
    } catch {}
    try {
      if (performance && performance.memory) {
        const m = performance.memory;
        setMemory({ jsHeapSizeLimit: m.jsHeapSizeLimit, totalJSHeapSize: m.totalJSHeapSize, usedJSHeapSize: m.usedJSHeapSize });
      }
    } catch {}
    try {
      setSecureContext(window.isSecureContext ?? null);
    } catch {}
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof navigator === "undefined" || !navigator.permissions) return;
      try {
        const status = await navigator.permissions.query({ name: "geolocation" });
        if (!cancelled) setPermission(status.state);
        // React to permission changes
        status.onchange = () => {
          setPermission(status.state);
        };
      } catch {
        // Permissions API may not be available
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function requestOnce() {
    if (!("geolocation" in navigator)) {
      setGeoError("Geolocation API not available in this browser.");
      return;
    }
    setGeoLoading(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition(simplifyPosition(pos));
        setGeoLoading(false);
      },
      (err) => {
        setGeoError(`${err.code}: ${err.message}`);
        setGeoLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10_000,
        maximumAge: 0,
      }
    );
  }

  function startWatch() {
    if (!("geolocation" in navigator)) {
      setGeoError("Geolocation API not available in this browser.");
      return;
    }
    if (watchIdRef.current != null) return; // already watching
    setGeoError(null);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => setPosition(simplifyPosition(pos)),
      (err) => setGeoError(`${err.code}: ${err.message}`),
      { enableHighAccuracy: true, maximumAge: 0 }
    );
  }

  function stopWatch() {
    if (watchIdRef.current != null && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }

  async function fetchIpFallback() {
    setIpLoading(true);
    setIpError(null);
    setIpResult(null);
    try {
      // Use a lightweight public endpoint; keep it optional
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch("https://ipapi.co/json/", { signal: controller.signal });
        clearTimeout(id);
        if (!res.ok) throw new Error(`${res.status}`);
        const json = await res.json();
        setIpResult({
          ip: json.ip,
          city: json.city,
          region: json.region,
          country: json.country_name,
          latitude: json.latitude,
          longitude: json.longitude,
          timezone: json.timezone,
          org: json.org,
        });
      } catch (e) {
        // Fallback alternative endpoint
        const res2 = await fetch("https://ipinfo.io/json?token=",
          { headers: { Accept: "application/json" } }
        );
        if (!res2.ok) throw new Error(`${res2.status}`);
        const j2 = await res2.json();
        let lat = null, lon = null;
        if (typeof j2.loc === "string" && j2.loc.includes(",")) {
          const [a, b] = j2.loc.split(",");
          lat = Number(a);
          lon = Number(b);
        }
        setIpResult({
          ip: j2.ip,
          city: j2.city,
          region: j2.region,
          country: j2.country,
          latitude: lat,
          longitude: lon,
          timezone: j2.timezone,
          org: j2.org,
        });
      }
    } catch (err) {
      setIpError(err.message || String(err));
    } finally {
      setIpLoading(false);
    }
  }

  return (
    <div className="p-4 max-w-4xl">
      <div className="flex items-start justify-between">
        <h1 className="text-2xl font-bold mb-2">Location Approximator</h1>
        <Link href="/admin" className="text-sm text-blue-600 hover:underline">Back to Admin</Link>
      </div>
      <p className="text-sm text-gray-600 mb-4">
        Uses browser Geolocation (accurate) when permitted, otherwise an IP-based fallback (approximate).
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="border rounded p-4 bg-white">
          <h2 className="font-semibold mb-2">Browser Geolocation</h2>
          <dl className="text-sm grid grid-cols-2 gap-x-2 gap-y-1">
            <dt className="text-gray-600">Permission</dt><dd className="font-medium">{permission}</dd>
            <dt className="text-gray-600">Secure Context</dt><dd className="font-medium">{secureContext == null ? "—" : String(secureContext)}</dd>
          </dl>
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              onClick={requestOnce}
              disabled={geoLoading}
              className="px-3 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
            >
              {geoLoading ? "Requesting…" : "Get Current Position"}
            </button>
            <button onClick={startWatch} className="px-3 py-2 rounded bg-gray-200 hover:bg-gray-300">Start Watch</button>
            <button onClick={stopWatch} className="px-3 py-2 rounded bg-gray-200 hover:bg-gray-300">Stop Watch</button>
          </div>
          {geoError && <p className="mt-2 text-sm text-red-600">{geoError}</p>}
          {position && (
            <div className="mt-3 text-sm">
              <h3 className="font-medium mb-1">Position</h3>
              {position?.links?.googleMaps && (
                <p className="mb-2">
                  <a
                    href={position.links.googleMaps}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    View on Google Maps
                  </a>
                </p>
              )}
              <pre className="whitespace-pre-wrap text-xs leading-5 p-2 bg-gray-50 rounded border">
{JSON.stringify(position, null, 2)}
              </pre>
            </div>
          )}
        </section>

        <section className="border rounded p-4 bg-white">
          <h2 className="font-semibold mb-2">IP-based Approximation</h2>
          <p className="text-xs text-gray-600 mb-2">Less precise; does not require permission.</p>
          <button
            onClick={fetchIpFallback}
            disabled={ipLoading}
            className="px-3 py-2 rounded bg-black text-white disabled:opacity-50"
          >
            {ipLoading ? "Fetching…" : "Get IP Approximation"}
          </button>
          {ipError && <p className="mt-2 text-sm text-red-600">{ipError}</p>}
          {ipResult && (
            <div className="mt-3 text-sm">
              <h3 className="font-medium mb-1">Result</h3>
              {Number.isFinite(ipResult?.latitude) && Number.isFinite(ipResult?.longitude) && (
                <p className="mb-2">
                  <a
                    href={`https://maps.google.com/?q=${ipResult.latitude},${ipResult.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    View on Google Maps
                  </a>
                </p>
              )}
              <pre className="whitespace-pre-wrap text-xs leading-5 p-2 bg-gray-50 rounded border">
{JSON.stringify(ipResult, null, 2)}
              </pre>
            </div>
          )}
        </section>

        <section className="border rounded p-4 bg-white md:col-span-2">
          <h2 className="font-semibold mb-2">Environment Signals</h2>
          <dl className="text-sm grid grid-cols-2 md:grid-cols-4 gap-x-2 gap-y-1">
            <dt className="text-gray-600">Timezone</dt><dd className="font-medium break-all">{tz || "—"}</dd>
            <dt className="text-gray-600">Locale</dt><dd className="font-medium">{locale || "—"}</dd>
            <dt className="text-gray-600">Network</dt>
            <dd className="font-medium">{networkInfo ? `${networkInfo.effectiveType || "?"} (${networkInfo.downlink || "?"}Mbps)` : "—"}</dd>
            <dt className="text-gray-600">Memory</dt>
            <dd className="font-medium">{memory ? `${formatBytes(memory.usedJSHeapSize)} / ${formatBytes(memory.jsHeapSizeLimit)}` : "—"}</dd>
          </dl>
        </section>
      </div>
    </div>
  );
}

function simplifyPosition(pos) {
  const { coords, timestamp } = pos || {};
  if (!coords) return null;
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracyMeters: coords.accuracy,
    altitudeMeters: coords.altitude ?? null,
    altitudeAccuracyMeters: coords.altitudeAccuracy ?? null,
    headingDegrees: coords.heading ?? null,
    speedMetersPerSecond: coords.speed ?? null,
    timestamp,
    // Helpful links
    links: makeLinks(coords.latitude, coords.longitude),
  };
}

function makeLinks(lat, lon) {
  if (typeof lat !== "number" || typeof lon !== "number") return null;
  const q = `${lat.toFixed(6)},${lon.toFixed(6)}`;
  return {
    googleMaps: `https://maps.google.com/?q=${q}`,
    openStreetMap: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`,
    appleMaps: `https://maps.apple.com/?ll=${lat},${lon}`,
  };
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"]; 
  let idx = 0;
  let n = bytes;
  while (n >= 1024 && idx < units.length - 1) {
    n /= 1024;
    idx++;
  }
  return `${n.toFixed(1)} ${units[idx]}`;
}


