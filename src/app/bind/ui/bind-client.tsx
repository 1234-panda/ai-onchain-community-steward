"use client";

import { ethers } from "ethers";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { UserProfile } from "@/lib/types";

declare global {
  interface Window {
    ethereum?: ethers.Eip1193Provider;
  }
}

export function BindClient() {
  const params = useSearchParams();
  const discordId = params.get("discordId") ?? "demo-user";
  const guildId = params.get("guildId") ?? undefined;
  const [expectedChainId, setExpectedChainId] = useState(11155111);
  const [walletChainId, setWalletChainId] = useState<number>();
  const [status, setStatus] = useState("等待连接钱包");
  const [profile, setProfile] = useState<UserProfile>();

  useEffect(() => {
    fetch("/api/setup/status")
      .then((response) => response.json())
      .then((data) => setExpectedChainId(data.expectedChainId ?? 11155111))
      .catch(() => undefined);
  }, []);

  async function ensureNetwork(provider: ethers.BrowserProvider) {
    const network = await provider.getNetwork();
    const current = Number(network.chainId);
    setWalletChainId(current);
    if (current === expectedChainId) return true;

    if (expectedChainId === 11155111 && window.ethereum) {
      setStatus("钱包不在 Sepolia，正在请求切换网络...");
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0xaa36a7" }]
        });
        return true;
      } catch {
        setStatus("请在钱包中手动切换到 Sepolia 测试网后再绑定。");
        return false;
      }
    }

    setStatus(`钱包当前 chainId=${current}，但应用配置为 ${expectedChainId}。请切换网络。`);
    return false;
  }

  async function bindWallet() {
    if (!window.ethereum) {
      setStatus("未检测到 MetaMask 或兼容 EVM 钱包。");
      return;
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    if (!(await ensureNetwork(provider))) return;

    const signer = await provider.getSigner();
    const walletAddress = await signer.getAddress();
    setStatus("正在生成绑定挑战...");
    const challengeResponse = await fetch("/api/wallet/bind-challenge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ guildId, discordId, walletAddress })
    });
    const challenge = await challengeResponse.json();
    if (!challengeResponse.ok) {
      setStatus(challenge.error ?? "生成挑战失败");
      return;
    }

    setStatus("请在钱包里签名确认绑定用途。");
    const signature = await signer.signMessage(challenge.message);
    const verifyResponse = await fetch("/api/wallet/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ challengeId: challenge.id, signature })
    });
    const verified = await verifyResponse.json();
    if (!verifyResponse.ok) {
      setStatus(verified.error ?? "签名验证失败");
      return;
    }

    const profileResponse = await fetch(`/api/users/${discordId}/profile?guildId=${verified.guildId}`);
    setProfile(await profileResponse.json());
    setStatus("绑定成功");
  }

  return (
    <main className="shell narrow">
      <section className="card">
        <p className="section-label">Wallet Binding</p>
        <h1>连接钱包，绑定 Discord 身份</h1>
        <p className="hint">Discord ID: {discordId}</p>
        <p className="hint">目标网络：{expectedChainId === 11155111 ? "Sepolia" : expectedChainId}；钱包网络：{walletChainId ?? "未连接"}</p>
        <button onClick={bindWallet}>连接 MetaMask 并签名</button>
        <p>{status}</p>
        {profile && (
          <div className="notice low">
            <strong>当前身份等级：{profile.reviewMode}</strong>
            <p>信誉分 {profile.trustScore}，钱包 {profile.walletAddress}</p>
            <small>{profile.labels.join(" · ")}</small>
          </div>
        )}
      </section>
    </main>
  );
}
