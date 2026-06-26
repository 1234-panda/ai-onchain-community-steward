"use client";

import { useEffect, useState } from "react";
import type { AgentSuggestion, DashboardHealth, ModerationEventType } from "@/lib/types";

const eventNames: Record<ModerationEventType, string> = {
  0: "WARNING",
  1: "SPAM",
  2: "SCAM_SUSPECTED",
  3: "BAN",
  4: "MUTE",
  5: "APPEAL_ACCEPTED",
  6: "POSITIVE_CONTRIBUTION"
};

function txUrl(health: DashboardHealth | undefined, hash?: string) {
  if (!health?.chain.explorerBaseUrl || !hash) return undefined;
  return `${health.chain.explorerBaseUrl.replace(/\/$/, "")}/tx/${hash}`;
}

function addressUrl(health: DashboardHealth | undefined, address?: string) {
  if (!health?.chain.explorerBaseUrl || !address) return undefined;
  return `${health.chain.explorerBaseUrl.replace(/\/$/, "")}/address/${address}`;
}

const severityRank: Record<AgentSuggestion["severity"], number> = {
  high: 3,
  medium: 2,
  low: 1
};

export function DashboardClient() {
  const [health, setHealth] = useState<DashboardHealth>();
  const [inviteUrl, setInviteUrl] = useState("");

  async function refreshHealth() {
    const [healthResponse, inviteResponse] = await Promise.all([
      fetch("/api/dashboard/health", { cache: "no-store" }),
      fetch("/api/discord/invite-url", { cache: "no-store" })
    ]);
    setHealth(await healthResponse.json());
    if (inviteResponse.ok) {
      setInviteUrl((await inviteResponse.json()).url);
    }
  }

  useEffect(() => {
    refreshHealth();
  }, []);

  const contractLink = addressUrl(health, health?.chain.contractAddress);
  const visibleSuggestions = [...(health?.suggestions ?? [])]
    .sort((left, right) => {
      const severityDiff = severityRank[right.severity] - severityRank[left.severity];
      if (severityDiff) return severityDiff;
      return new Date(right.updatedAt ?? right.createdAt).getTime() - new Date(left.updatedAt ?? left.createdAt).getTime();
    })
    .slice(0, 3);

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Discord-first Admin Flow</p>
          <h1>AI On-Chain Community Steward</h1>
          <p className="lede">
            Discord handles day-to-day moderation. This dashboard is now read-only for audit, setup, and profile inspection.
          </p>
          <div className="quick-links">
            <a href="/setup">Setup checks</a>
            <a href="/settings">Global rules</a>
            {inviteUrl && <a href={inviteUrl} target="_blank">Invite Bot</a>}
          </div>
          <p className="hint">Wallet binding still starts from Discord `/bind`, because MetaMask signing must happen in the browser.</p>
        </div>
        <div className="health-orb">
          <span>{health?.healthScore ?? "--"}</span>
          <small>Health Score</small>
        </div>
      </section>

      <section className="grid overview-grid">
        <article className="card status-card">
          <div>
            <p className="section-label">Chain</p>
            <h2>{health?.chain.chainId === 11155111 ? "Sepolia" : "Configured Network"}</h2>
            <dl>
              <div><dt>Chain ID</dt><dd>{health?.chain.chainId ?? "--"}</dd></div>
              <div><dt>RPC</dt><dd>{health?.chain.rpcUrl ?? "--"}</dd></div>
              <div>
                <dt>Reputation Contract</dt>
                <dd>{contractLink ? <a className="inline-link" href={contractLink} target="_blank">{health?.chain.contractAddress}</a> : health?.chain.contractAddress ?? "not configured"}</dd>
              </div>
            </dl>
          </div>
          <div>
            <p className="section-label">Discord</p>
            <h2>Admin workflow moved into Discord</h2>
            <div className="stack">
              <p className="hint">Use Discord for `/config admin-channel`, `/queue`, `/rules`, `/demo`, confirmation buttons, positive governance, and pass issuance.</p>
              <p className="hint">This page stays lean: setup, rules, chain status, and non-empty audit signals only.</p>
            </div>
          </div>
        </article>
      </section>

      <section className="grid">
        {!!health?.pendingEvents.length && (
          <article className="card">
            <p className="section-label">Pending Queue</p>
            <h2>Read-only audit mirror</h2>
            <div className="stack event-list">
              {health.pendingEvents.map((event) => (
                <div className="event" key={event.id}>
                  <div><strong>{eventNames[event.eventType]}</strong><span>{event.scoreDelta > 0 ? `+${event.scoreDelta}` : event.scoreDelta}</span></div>
                  <p>{event.reason} / {event.discordId}</p>
                  <small>{event.messageSummary}</small>
                </div>
              ))}
            </div>
          </article>
        )}

        {!!visibleSuggestions.length && (
          <article className="card">
            <p className="section-label">AI Suggestions</p>
            <h2>Advice only</h2>
            <div className="stack">
              {visibleSuggestions.map((suggestion) => (
                <div className={`notice ${suggestion.severity}`} key={suggestion.id}>
                  <strong>{suggestion.title}</strong>
                  <p>{suggestion.summary}</p>
                  <small>{suggestion.recommendation}</small>
                </div>
              ))}
            </div>
          </article>
        )}
      </section>

      {!!health?.recentEvents.length && (
        <section className="grid">
          <article className="card">
            <p className="section-label">Governance Records</p>
            <h2>Audit trail</h2>
            <div className="stack event-list">
              {health.recentEvents.map((event) => {
                const link = event.chainStatus === "local_only" ? undefined : txUrl(health, event.txHash);
                return (
                  <div className="event" key={event.id}>
                    <div><strong>{eventNames[event.eventType]}</strong><span>{event.chainStatus}</span></div>
                    <p>{event.reason} / {event.discordId}</p>
                    {link ? <a className="inline-link" href={link} target="_blank">{event.txHash}</a> : <code>{event.eventHash.slice(0, 18)}...</code>}
                    {event.chainError && <small>{event.chainError}</small>}
                  </div>
                );
              })}
            </div>
          </article>
        </section>
      )}
    </main>
  );
}
