"use client";

import { useState, useTransition } from "react";

type UserPassActionsProps = {
  guildId: string;
  discordId: string;
  walletAddress?: string;
  hasPass: boolean;
};

function adminHeaders(password: string) {
  return {
    "content-type": "application/json",
    "x-demo-role": "admin",
    "x-admin-id": "profile-admin",
    "x-admin-password": password
  };
}

export function UserPassActions({ guildId, discordId, walletAddress, hasPass }: UserPassActionsProps) {
  const [adminPassword, setAdminPassword] = useState("");
  const [message, setMessage] = useState("");
  const [positiveReason, setPositiveReason] = useState("积极贡献，增加社区信誉");
  const [positiveSummary, setPositiveSummary] = useState("该成员帮助社区答疑、整理资料或贡献了安全提醒。");
  const [isPending, startTransition] = useTransition();

  async function issuePass() {
    if (!walletAddress) {
      setMessage("该用户还没有绑定钱包，不能发放社区通行证。");
      return;
    }

    const confirmed = window.confirm(
      `确认给 ${discordId} 发放不可转让的社区通行证吗？\n钱包：${walletAddress}\n\nmint 后不能简单撤回，请确认该成员已通过社区审核。`
    );
    if (!confirmed) return;

    startTransition(async () => {
      const response = await fetch("/api/member-pass/issue", {
        method: "POST",
        headers: adminHeaders(adminPassword),
        body: JSON.stringify({ guildId, discordId })
      });
      const payload = await response.json();
      setMessage(response.ok ? `已发放社区通行证，txHash: ${payload.issuance?.txHash ?? "pending"}` : payload.error ?? "发放失败。");
    });
  }

  async function refreshPass() {
    startTransition(async () => {
      const response = await fetch("/api/member-pass/refresh", {
        method: "POST",
        headers: adminHeaders(adminPassword),
        body: JSON.stringify({ guildId, discordId })
      });
      const payload = await response.json();
      setMessage(response.ok ? "已重新读取链上通行证状态，刷新页面可看到最新画像。" : payload.error ?? "刷新失败。");
    });
  }

  async function createPositive(eventType: 5 | 6) {
    startTransition(async () => {
      const response = await fetch("/api/moderation/positive", {
        method: "POST",
        headers: adminHeaders(adminPassword),
        body: JSON.stringify({ guildId, discordId, eventType, reason: positiveReason, messageSummary: positiveSummary })
      });
      const payload = await response.json();
      setMessage(response.ok ? "已创建正向待确认事件，请回到 Dashboard 确认写链。" : payload.error ?? "创建正向事件失败。");
    });
  }

  return (
    <section className="card">
      <p className="section-label">管理员操作</p>
      <h2>社区通行证与正向治理</h2>
      <input
        className="admin-input"
        placeholder="Admin Dashboard Password"
        type="password"
        value={adminPassword}
        onChange={(event) => setAdminPassword(event.target.value)}
      />
      <div className="scenario-row">
        <button disabled={isPending || !walletAddress || hasPass} onClick={issuePass}>
          {hasPass ? "已持有通行证" : "发放社区通行证"}
        </button>
        <button disabled={isPending || !walletAddress} onClick={refreshPass}>刷新链上状态</button>
      </div>
      <input className="field" value={positiveReason} onChange={(event) => setPositiveReason(event.target.value)} />
      <textarea className="field" value={positiveSummary} onChange={(event) => setPositiveSummary(event.target.value)} />
      <div className="scenario-row">
        <button disabled={isPending} onClick={() => createPositive(6)}>记录积极贡献</button>
        <button disabled={isPending} onClick={() => createPositive(5)}>申诉通过</button>
      </div>
      {message && <p className="hint">{message}</p>}
      <p className="hint">正向治理事件会先进入待确认队列，管理员确认后才写链。</p>
    </section>
  );
}
