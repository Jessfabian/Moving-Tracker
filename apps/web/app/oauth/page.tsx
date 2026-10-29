"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { finishOAuth } from "@/lib/inbox";

export default function OAuthReturn() {
  const router = useRouter();
  const [error, setError] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    finishOAuth()
      .then((to) => router.replace(to || "/subscriptions"))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [router]);

  return (
    <div className="mx-auto max-w-md py-16 text-center">
      {error ? (
        <>
          <p className="text-lg font-semibold">Couldn&apos;t connect your email</p>
          <p className="mt-2 text-sm text-gray-600">{error}</p>
          <button type="button" className="btn-primary mt-6" onClick={() => router.replace("/subscriptions")}>
            Back to Subscriptions
          </button>
        </>
      ) : (
        <>
          <span className="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-ink/20 border-t-ink" aria-hidden />
          <p className="mt-4 text-sm text-gray-600" role="status">
            Connecting your email…
          </p>
        </>
      )}
    </div>
  );
}
