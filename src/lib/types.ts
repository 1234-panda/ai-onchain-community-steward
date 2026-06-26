export enum ModerationEventType {
  WARNING = 0,
  SPAM = 1,
  SCAM_SUSPECTED = 2,
  BAN = 3,
  MUTE = 4,
  APPEAL_ACCEPTED = 5,
  POSITIVE_CONTRIBUTION = 6
}

export type ReviewMode = "strict" | "standard" | "vip";
export type DataSource = "demo" | "discord";
export type HoldingSource = "onchain" | "cache" | "simulated";
export type OnchainReputationStatus = "not_configured" | "success" | "failed" | "cached";
export type DemoOutcome = "pending_created" | "suggestion_created" | "message_only" | "positive_created";
export type ChainWriteMode = "manual" | "off" | "auto_confirmed";
export type ChainStatus = "not_configured" | "pending" | "success" | "failed" | "local_only" | "awaiting_wallet";

export type WalletBinding = {
  guildId: string;
  discordId: string;
  walletAddress: string;
  boundAt: string;
};

export type WalletBindingHistory = WalletBinding & {
  replacedAt?: string;
};

export type WalletChallenge = {
  id: string;
  guildId: string;
  discordId: string;
  walletAddress: string;
  nonce: string;
  message: string;
  expiresAt: string;
  usedAt?: string;
};

export type HoldingSnapshot = {
  tokenBalance: number;
  nftCount: number;
  tokenSymbol: string;
  source: HoldingSource;
  updatedAt?: string;
};

export type UserProfile = {
  guildId: string;
  discordId: string;
  walletAddress?: string;
  reviewMode: ReviewMode;
  trustScore: number;
  localScore: number;
  onchainReputation: OnchainReputation;
  sybilRisk: SybilRisk;
  trustBreakdown: TrustBreakdown;
  signalSummary: SignalSummary;
  reviewExplanation: string[];
  holdings: HoldingSnapshot;
  events: ModerationRecord[];
  bindingHistory: WalletBindingHistory[];
  labels: string[];
};

export type OnchainReputation = {
  score: number;
  eventCount: number;
  status: OnchainReputationStatus;
  error?: string;
  updatedAt?: string;
};

export type SybilRisk = {
  score: number;
  level: "low" | "medium" | "high";
  signals: string[];
};

export type TrustBreakdown = {
  base: number;
  holdingScore: number;
  localEventScore: number;
  onchainScoreContribution: number;
  sybilPenalty: number;
  newWalletPenalty: number;
  final: number;
};

export type SignalSummary = {
  localBehavior: "良好" | "有风险" | "多次违规" | "暂无记录";
  globalReputation: "无记录" | "有负面记录" | "有正向记录" | "读取失败" | "未配置";
  sybilRisk: "低" | "中" | "高";
};

export type CommunityMessage = {
  id: string;
  guildId: string;
  discordId: string;
  authorName: string;
  content: string;
  source: DataSource;
  createdAt: string;
  walletAddress?: string;
};

export type ModerationRecord = {
  id: string;
  guildId: string;
  discordId: string;
  walletAddress?: string;
  eventType: ModerationEventType;
  scoreDelta: number;
  reason: string;
  messageSummary: string;
  eventHash: string;
  txHash?: string;
  chainStatus: ChainStatus;
  chainError?: string;
  adminId: string;
  source: DataSource;
  createdAt: string;
};

export type PendingEvent = {
  id: string;
  guildId: string;
  discordId: string;
  walletAddress?: string;
  eventType: ModerationEventType;
  scoreDelta: number;
  reason: string;
  messageSummary: string;
  source: DataSource;
  createdAt: string;
};

export type AgentSuggestion = {
  id: string;
  guildId: string;
  type?: "fud" | "sybil_cluster" | "llm_fallback" | "llm";
  riskSignature?: string;
  title: string;
  severity: "low" | "medium" | "high";
  summary: string;
  recommendation: string;
  isAdviceOnly: true;
  createdAt: string;
  updatedAt?: string;
};

export type MemberPassCandidate = {
  guildId: string;
  discordId: string;
  walletAddress: string;
  hasPass: boolean;
  holdingSource: HoldingSource;
  lastBoundAt?: string;
  updatedAt?: string;
  error?: string;
};

export type MemberPassCandidateGroups = {
  withoutPass: MemberPassCandidate[];
  withPass: MemberPassCandidate[];
};

export type MemberPassIssuance = {
  id: string;
  guildId: string;
  discordId: string;
  walletAddress: string;
  txHash?: string;
  status: "success" | "failed";
  error?: string;
  adminId: string;
  createdAt: string;
};

export type BackfillResult = {
  backfilledRecords: number;
  chainWrites: number;
  pendingChainWrites: number;
  records: ModerationRecord[];
};

export type DashboardHealth = {
  guildId: string;
  healthScore: number;
  sentiment: "positive" | "neutral" | "stressed";
  activeRiskUsers: UserProfile[];
  recentEvents: ModerationRecord[];
  pendingEvents: PendingEvent[];
  suggestions: AgentSuggestion[];
  chain: ChainConfig;
  stats: {
    bindings: number;
    messages: number;
    pending: number;
    confirmed: number;
    demoMessages: number;
    discordMessages: number;
  };
};

export type ChainConfig = {
  chainId: number;
  rpcUrl: string;
  contractAddress?: string;
  explorerBaseUrl?: string;
};

export type GuildConfig = {
  guildId: string;
  adminChannelId: string;
  demoMode: boolean;
  updatedAt: string;
};

export type RuleSettings = {
  vipTokenThreshold: number;
  nftTrustBonus: number;
  newWalletPenalty: number;
  spamPenalty: number;
  spamTerms: string[];
  scamTerms: string[];
  fudTerms: string[];
};

export type AppState = {
  version: 1;
  guildConfigs: GuildConfig[];
  bindings: WalletBinding[];
  bindingHistory: WalletBindingHistory[];
  challenges: WalletChallenge[];
  holdings: Record<string, HoldingSnapshot>;
  messages: CommunityMessage[];
  pendingEvents: PendingEvent[];
  moderation: ModerationRecord[];
  suggestions: AgentSuggestion[];
  passIssuances: MemberPassIssuance[];
  rules: RuleSettings;
};
