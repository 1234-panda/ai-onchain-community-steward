import { ethers } from "ethers";
import { appConfig, chainConfig } from "./config";
import { HoldingSnapshot } from "./types";

const erc20Abi = ["function balanceOf(address owner) view returns (uint256)", "function symbol() view returns (string)"];
const erc721Abi = ["function balanceOf(address owner) view returns (uint256)"];

export async function fetchHoldingSnapshot(walletAddress: string): Promise<HoldingSnapshot | undefined> {
  if (!appConfig.vipTokenAddress && !appConfig.vipNftAddress) {
    return undefined;
  }

  const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
  let tokenBalance = 0;
  let tokenSymbol = "TOKEN";
  let nftCount = 0;

  if (appConfig.vipTokenAddress) {
    const token = new ethers.Contract(appConfig.vipTokenAddress, erc20Abi, provider);
    const [rawBalance, symbol] = await Promise.all([
      token.balanceOf(walletAddress),
      token.symbol().catch(() => "TOKEN")
    ]);
    tokenBalance = Number(ethers.formatUnits(rawBalance, appConfig.vipTokenDecimals));
    tokenSymbol = symbol;
  }

  if (appConfig.vipNftAddress) {
    const nft = new ethers.Contract(appConfig.vipNftAddress, erc721Abi, provider);
    nftCount = Number(await nft.balanceOf(walletAddress));
  }

  return {
    tokenBalance,
    nftCount,
    tokenSymbol,
    source: "onchain",
    updatedAt: new Date().toISOString()
  };
}
