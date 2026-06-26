import Link from "next/link";

export const dynamic = "force-dynamic";

type SetupStatus = {
  checks: Record<string, boolean>;
  chainReachable: boolean;
  actualChainId?: number;
  expectedChainId: number;
  chainIdMatches: boolean;
  latestBlock?: number;
  serviceWalletAddress?: string;
  serviceWalletBalanceEth?: string;
  contractExplorerUrl?: string;
  mode: Record<string, string | boolean>;
  warnings: string[];
};

export default async function SetupPage() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const response = await fetch(`${baseUrl}/api/setup/status`, { cache: "no-store" }).catch(() => undefined);
  const status = response?.ok ? ((await response.json()) as SetupStatus) : undefined;
  const invite = await fetch(`${baseUrl}/api/discord/invite-url`, { cache: "no-store" }).catch(() => undefined);
  const inviteUrl = invite?.ok ? (await invite.json()).url : "";

  return (
    <main className="shell narrow">
      <section className="card">
        <p className="section-label">Setup</p>
        <h1>Sepolia 安装检查</h1>
        <p className="hint">确认 Discord Bot、Sepolia RPC、服务钱包余额、信誉合约和 AI 配置是否准备好。</p>
        <div className="steps setup-steps">
          <div><b>1</b><span>填好 `.env.local` 的 Sepolia RPC 和测试钱包私钥</span></div>
          <div><b>2</b><span>运行 `npm run deploy:sepolia`，把合约地址填回环境变量</span></div>
          <div><b>3</b><span>邀请 Bot 到 Discord，让成员执行 `/bind`</span></div>
        </div>
        {inviteUrl && <a className="text-link" href={inviteUrl} target="_blank">打开 Discord 邀请链接</a>}
      </section>

      <section className="card">
        <h2>链状态</h2>
        <div className="stack">
          <div className="row"><span>目标 chainId</span><b>{status?.expectedChainId ?? "--"}</b></div>
          <div className="row"><span>RPC 实际 chainId</span><b>{status?.actualChainId ?? "不可连接"}</b></div>
          <div className="row"><span>chainId 是否匹配</span><b>{status?.chainIdMatches ? "OK" : "不匹配"}</b></div>
          <div className="row"><span>最新区块</span><b>{status?.latestBlock ?? "--"}</b></div>
          <div className="row"><span>服务钱包</span><b>{status?.serviceWalletAddress ?? "未配置"}</b></div>
          <div className="row"><span>服务钱包余额</span><b>{status?.serviceWalletBalanceEth ?? "--"} ETH</b></div>
          <div className="row">
            <span>信誉合约</span>
            <b>{status?.contractExplorerUrl ? <a className="inline-link" href={status.contractExplorerUrl} target="_blank">Etherscan 查看</a> : "未配置"}</b>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>配置状态</h2>
        <div className="stack">
          {status &&
            Object.entries(status.checks).map(([key, ok]) => (
              <div className="row" key={key}><span>{key}</span><b>{ok ? "OK" : "缺失"}</b></div>
            ))}
          <div className="row"><span>chainReachable</span><b>{status?.chainReachable ? "OK" : "不可连接"}</b></div>
        </div>
        {!!status?.warnings.length && (
          <div className="notice medium">
            <strong>需要注意</strong>
            {status.warnings.map((warning) => <p key={warning}>{warning}</p>)}
          </div>
        )}
        <Link className="text-link" href="/">回到 Dashboard</Link>
      </section>
    </main>
  );
}
