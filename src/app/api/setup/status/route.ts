import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { appConfig, chainConfig, explorerAddressUrl } from "@/lib/config";

export async function GET() {
  const checks = {
    discordToken: Boolean(process.env.DISCORD_BOT_TOKEN),
    discordClientId: Boolean(appConfig.discordClientId),
    discordGuildId: Boolean(appConfig.discordGuildId),
    adminChannel: Boolean(appConfig.discordAdminChannelId),
    chainRpc: Boolean(chainConfig.rpcUrl),
    reputationContract: Boolean(chainConfig.contractAddress),
    serviceWallet: Boolean(appConfig.serviceWalletPrivateKey),
    llm: Boolean(appConfig.llm.apiKey),
    vipToken: Boolean(appConfig.vipTokenAddress),
    vipNft: Boolean(appConfig.vipNftAddress),
    adminPassword: Boolean(appConfig.adminDashboardPassword)
  };

  let chainReachable = false;
  let actualChainId: number | undefined;
  let latestBlock: number | undefined;
  let serviceWalletAddress: string | undefined;
  let serviceWalletBalanceEth: string | undefined;
  let chainError: string | undefined;

  try {
    const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
    const [network, blockNumber] = await Promise.all([provider.getNetwork(), provider.getBlockNumber()]);
    actualChainId = Number(network.chainId);
    latestBlock = blockNumber;
    chainReachable = true;

    if (appConfig.serviceWalletPrivateKey) {
      const wallet = new ethers.Wallet(appConfig.serviceWalletPrivateKey, provider);
      serviceWalletAddress = wallet.address;
      serviceWalletBalanceEth = ethers.formatEther(await provider.getBalance(wallet.address));
    }
  } catch (error) {
    chainError = error instanceof Error ? error.message : "Unknown RPC error";
  }

  const chainIdMatches = actualChainId === undefined ? false : actualChainId === chainConfig.chainId;
  const isSepoliaConfig = chainConfig.chainId === 11155111;

  return NextResponse.json({
    checks,
    chainReachable,
    actualChainId,
    expectedChainId: chainConfig.chainId,
    chainIdMatches,
    latestBlock,
    serviceWalletAddress,
    serviceWalletBalanceEth,
    contractExplorerUrl: explorerAddressUrl(chainConfig.contractAddress),
    mode: {
      demoMode: appConfig.demoMode,
      holdingMode: appConfig.vipTokenAddress || appConfig.vipNftAddress ? "onchain" : "simulated",
      chainWriteMode:
        chainConfig.contractAddress && appConfig.serviceWalletPrivateKey ? "enabled" : "chain-recording-disabled",
      targetNetwork: isSepoliaConfig ? "sepolia" : chainConfig.chainId === 31337 ? "hardhat-local" : "custom"
    },
    warnings: [
      !checks.discordToken ? "缺少 DISCORD_BOT_TOKEN，Bot 无法登录。" : undefined,
      !checks.discordClientId ? "缺少 DISCORD_CLIENT_ID，无法生成邀请链接。" : undefined,
      !chainReachable ? `当前 EVM_RPC_URL 无法连接：${chainError ?? "unknown error"}` : undefined,
      chainReachable && !chainIdMatches
        ? `RPC 实际 chainId=${actualChainId}，但配置 CHAIN_ID=${chainConfig.chainId}，请检查是否连到了 Sepolia。`
        : undefined,
      isSepoliaConfig && serviceWalletBalanceEth === "0.0"
        ? "服务钱包 Sepolia ETH 余额为 0，部署合约和写链交易会失败。"
        : undefined,
      !checks.reputationContract ? "未配置 REPUTATION_CONTRACT_ADDRESS，管理员确认后只能保存链下记录。" : undefined,
      !checks.vipToken && !checks.vipNft ? "未配置 VIP Token/NFT 地址，用户画像会使用模拟持仓。" : undefined,
      !checks.adminPassword ? "未设置 ADMIN_DASHBOARD_PASSWORD，演示环境可用，但不建议公开部署。" : undefined
    ].filter(Boolean)
  });
}
