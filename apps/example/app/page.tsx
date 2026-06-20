"use client";

import { useState } from "react";

export default function Home() {
  const [subjectValue, setSubjectValue] = useState("");
  const [result, setResult] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function callApi(path: string, execute = false) {
    if (!subjectValue) {
      setResult("Enter a user ID (from seed output)");
      return;
    }
    setLoading(true);
    try {
      const url = `/api/dsr/${path}?subjectValue=${encodeURIComponent(subjectValue)}${execute ? "&execute=true" : ""}`;
      const needsVerify = execute || path === "export";
      const res = await fetch(url, {
        method: "POST",
        headers: needsVerify ? { "x-dsr-verified": "true" } : {},
      });
      const json = await res.json();
      setResult(JSON.stringify(json, null, 2));
    } catch (err) {
      setResult(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ fontFamily: "system-ui", maxWidth: 800, margin: "2rem auto", padding: "0 1rem" }}>
      <h1>dsr-kit Example</h1>
      <p>GDPR erasure + export demo. Run <code>npm run db:seed</code> first.</p>

      <label>
        Subject userId:{" "}
        <input
          value={subjectValue}
          onChange={(e) => setSubjectValue(e.target.value)}
          style={{ width: 320 }}
          placeholder="User id from seed output (cuid)"
        />
      </label>

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button disabled={loading} onClick={() => callApi("erasure")}>
          Dry-run erasure
        </button>
        <button disabled={loading} onClick={() => callApi("erasure", true)}>
          Execute erasure
        </button>
        <button disabled={loading} onClick={() => callApi("export")}>
          Export data
        </button>
      </div>

      <pre
        style={{
          marginTop: 24,
          background: "#111",
          color: "#eee",
          padding: 16,
          overflow: "auto",
          minHeight: 200,
        }}
      >
        {result || "Results appear here"}
      </pre>
    </main>
  );
}
