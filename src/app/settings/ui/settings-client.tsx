"use client";

import { useEffect, useState } from "react";
import type { RuleSettings } from "@/lib/types";

type RulesPayload = {
  rules: RuleSettings;
  chainWriteMode: string;
};

export function SettingsClient() {
  const [payload, setPayload] = useState<RulesPayload>();

  useEffect(() => {
    fetch("/api/rules", { cache: "no-store" }).then(async (response) => setPayload(await response.json()));
  }, []);

  if (!payload) {
    return <main className="shell narrow"><section className="card">Loading...</section></main>;
  }

  const { rules, chainWriteMode } = payload;

  return (
    <main className="shell narrow">
      <section className="card">
        <p className="section-label">Settings</p>
        <h1>Global Rules</h1>
        <p className="hint">
          Rules are read-only in the UI. Change `src/lib/config.ts` and redeploy if you need to update the global scoring policy.
        </p>
        <div className="stack">
          <div className="row"><span>Chain write mode</span><b>{chainWriteMode}</b></div>
          <div className="row"><span>VIP token threshold</span><b>{rules.vipTokenThreshold}</b></div>
          <div className="row"><span>NFT trust bonus</span><b>{rules.nftTrustBonus}</b></div>
          <div className="row"><span>New wallet penalty</span><b>-{rules.newWalletPenalty}</b></div>
          <div className="row"><span>Spam penalty</span><b>-{rules.spamPenalty}</b></div>
        </div>
      </section>

      <section className="card">
        <h2>Keyword Sets</h2>
        <div className="stack">
          <p><strong>Spam</strong>: {rules.spamTerms.join(", ")}</p>
          <p><strong>Scam</strong>: {rules.scamTerms.join(", ")}</p>
          <p><strong>FUD</strong>: {rules.fudTerms.join(", ")}</p>
        </div>
      </section>
    </main>
  );
}
