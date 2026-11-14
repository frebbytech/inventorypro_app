"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div style={{ padding: "2rem", textAlign: "center" }}>
      <h1>Something went wrong.</h1>
      <p>We couldn&apos;t load this supplier. Please try again.</p>
      <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", color: "#d00" }}>
        {error?.message}
      </pre>
      <div style={{ marginTop: "1.5rem" }}>
        <button
          onClick={() => reset()}
          style={{ marginRight: "1rem", padding: "0.75rem 1.25rem" }}
        >
          Try again
        </button>
        <a href="/admin/supplier" style={{ padding: "0.75rem 1.25rem", textDecoration: "none" }}>
          Back to suppliers
        </a>
      </div>
    </div>
  );
}
