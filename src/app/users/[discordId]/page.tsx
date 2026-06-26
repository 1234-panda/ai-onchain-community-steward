import { appConfig, chainConfig, explorerAddressUrl, explorerTxUrl } from "@/lib/config";
import type { UserProfile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function UserPage({
  params,
  searchParams
}: {
  params: Promise<{ discordId: string }>;
  searchParams: Promise<{ guildId?: string }>;
}) {
  const { discordId } = await params;
  const { guildId } = await searchParams;
  const query = guildId ? `?guildId=${encodeURIComponent(guildId)}` : "";
  const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/users/${discordId}/profile${query}`, {
    cache: "no-store"
  });
  const profile = (await response.json()) as UserProfile;
  const walletExplorer = explorerAddressUrl(profile.walletAddress);
  const reputationExplorer = explorerAddressUrl(chainConfig.contractAddress);
  const passExplorer = explorerAddressUrl(appConfig.vipNftAddress);

  return (
    <main className="shell narrow">
      <section className="card">
        <p className="section-label">User Profile</p>
        <h1>{profile.discordId}</h1>
        <div className="score-line"><span>{profile.trustScore}</span><strong>{profile.reviewMode}</strong></div>
        <p className="wallet">
          {walletExplorer ? <a className="inline-link" href={walletExplorer} target="_blank">{profile.walletAddress}</a> : profile.walletAddress ?? "未绑定钱包"}
        </p>
        <div className="pill-row">{profile.labels.map((label) => <span key={label}>{label}</span>)}</div>
        <div className="stack">
          {profile.reviewExplanation.map((item) => <p className="explain" key={item}>{item}</p>)}
        </div>
      </section>

      <section className="card">
        <h2>判断依据</h2>
        <div className="asset-grid">
          <div><small>本社区表现</small><b>{profile.signalSummary.localBehavior}</b></div>
          <div><small>跨社区链上信誉</small><b>{profile.signalSummary.globalReputation}</b></div>
          <div><small>身份风险</small><b>{profile.signalSummary.sybilRisk}</b></div>
          <div><small>链上读取状态</small><b>{profile.onchainReputation.status}</b></div>
        </div>
        {reputationExplorer && <p className="hint">信誉合约：<a className="inline-link" href={reputationExplorer} target="_blank">{chainConfig.contractAddress}</a></p>}
      </section>

      <section className="card">
        <h2>社区资产与通行证</h2>
        <div className="asset-grid">
          <div><small>Token</small><b>{profile.holdings.tokenBalance} {profile.holdings.tokenSymbol}</b></div>
          <div><small>社区通行证</small><b>{profile.holdings.nftCount > 0 ? "已持有" : "未持有"}</b></div>
        </div>
        <p className="hint">数据来源：{profile.holdings.source}</p>
        {passExplorer && <p className="hint">通行证合约：<a className="inline-link" href={passExplorer} target="_blank">{appConfig.vipNftAddress}</a></p>}
      </section>

      <section className="card">
        <h2>历史绑定钱包</h2>
        <div className="stack">
          {profile.bindingHistory.map((item) => (
            <p className="explain" key={`${item.walletAddress}:${item.boundAt}`}>
              {item.walletAddress} / 绑定于 {new Date(item.boundAt).toLocaleString()} {item.replacedAt ? `/ 换绑于 ${new Date(item.replacedAt).toLocaleString()}` : ""}
            </p>
          ))}
          {!profile.bindingHistory.length && <p className="empty">暂无历史绑定记录。</p>}
        </div>
      </section>

      <section className="card">
        <h2>高级分数明细</h2>
        <div className="stack">
          <div className="row"><span>基础分</span><b>{profile.trustBreakdown.base}</b></div>
          <div className="row"><span>资产/通行证加分</span><b>{profile.trustBreakdown.holdingScore}</b></div>
          <div className="row"><span>本社区事件影响</span><b>{profile.trustBreakdown.localEventScore}</b></div>
          <div className="row"><span>Sepolia 全局信誉影响</span><b>{profile.trustBreakdown.onchainScoreContribution}</b></div>
          <div className="row"><span>身份风险扣分</span><b>-{profile.trustBreakdown.sybilPenalty}</b></div>
          <div className="row"><span>未绑定钱包扣分</span><b>-{profile.trustBreakdown.newWalletPenalty}</b></div>
          <div className="row"><span>最终综合分</span><b>{profile.trustBreakdown.final}</b></div>
        </div>
      </section>

      <section className="card">
        <h2>链上全局信誉</h2>
        <div className="asset-grid">
          <div><small>链上分</small><b>{profile.onchainReputation.score}</b></div>
          <div><small>链上事件数</small><b>{profile.onchainReputation.eventCount}</b></div>
        </div>
        {profile.onchainReputation.error && <p className="hint">读取错误：{profile.onchainReputation.error}</p>}
      </section>

      <section className="card">
        <h2>身份风险信号</h2>
        <div className="stack">
          {profile.sybilRisk.signals.map((signal) => <p className="explain" key={signal}>{signal}</p>)}
          {!profile.sybilRisk.signals.length && <p className="empty">暂无明显身份风险信号。</p>}
        </div>
      </section>

      <section className="card">
        <h2>本社区治理事件</h2>
        <div className="stack">
          {profile.events.map((event) => {
            const link = event.chainStatus === "local_only" ? undefined : explorerTxUrl(event.txHash);
            return (
              <div className="event" key={event.id}>
                <div><strong>{event.reason}</strong><span>{event.chainStatus}</span></div>
                <p>{event.messageSummary}</p>
                {link ? <a className="inline-link" href={link} target="_blank">{event.txHash}</a> : <code>{event.eventHash}</code>}
              </div>
            );
          })}
          {!profile.events.length && <p className="empty">暂无本社区治理事件。</p>}
        </div>
      </section>
    </main>
  );
}
