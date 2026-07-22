export const CHAIN = {
  id: 4663,
  name: "Robinhood Chain",
};

export const PONS = {
  rpcUrl: process.env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com",
  activeFactory: "0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB",
  activeFactoryStartBlock: 8991118n,
  legacyFactory: "0x0c37a24F5D23A486FA692d1500881d698B1F77a4",
  legacyFactoryStartBlock: 8600612n,
  weth: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
  defaultGraduationThresholdEth: 4.2,
};

export const EVENTS = {
  tokenLaunchedTopic:
    "0xdb51ea9ad51ab453a65a4cb7e60c3cb378c9501bb002609f8f97778fb6c4235a",
  swapTopic:
    "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67",
  transferTopic:
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
};

export const SETTINGS = {
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || 8000),
  logChunkSize: BigInt(process.env.LOG_CHUNK_SIZE || 1000),
  stateFile: process.env.STATE_FILE || "./data/state.json",
  runOnce:
    String(process.env.RUN_ONCE || "false").toLowerCase() === "true" ||
    process.argv.includes("--once"),
  fullBackfill: String(process.env.FULL_BACKFILL || "false").toLowerCase() === "true",
  initialBackfillBlocks: BigInt(process.env.INITIAL_BACKFILL_BLOCKS || 20000),
  scoreWindowMs: 5 * 60 * 1000,
  whaleSellEth: Number(process.env.WHALE_SELL_ETH || 0.5),
  maxContractReadsPerPoll: Number(process.env.MAX_CONTRACT_READS_PER_POLL || 50),
  maxSwapPoolsPerPoll: Number(process.env.MAX_SWAP_POOLS_PER_POLL || 50),
  maxTransferTokensPerPoll: Number(process.env.MAX_TRANSFER_TOKENS_PER_POLL || 25),
  rpcTimeoutMs: Number(process.env.RPC_TIMEOUT_MS || 15000),
  minMarketCapUsd: Number(process.env.MIN_MARKET_CAP_USD || 50000),
  requireGraduated: String(process.env.REQUIRE_GRADUATED || "true").toLowerCase() === "true",
  ethPriceUsd: Number(process.env.ETH_PRICE_USD || 1800),
  whatsappEnabled: String(process.env.WHATSAPP_ENABLED || "true").toLowerCase() === "true",
  whatsappProvider: (process.env.WHATSAPP_PROVIDER || "twilio").toLowerCase(),
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || "",
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || "",
  twilioFromNumber: process.env.TWILIO_WHATSAPP_NUMBER || "",
  whatsappToNumber: process.env.TO_WHATSAPP_NUMBER || "",
  callmebotPhone: process.env.CALLMEBOT_PHONE || "",
  callmebotApiKey: process.env.CALLMEBOT_API_KEY || "",
  whatsappWebhookUrl: process.env.WHATSAPP_WEBHOOK_URL || "",
  maxMigrationAgeHours: Number(process.env.MAX_MIGRATION_AGE_HOURS || 24),
  minMomentumBuyVolEth: Number(process.env.MIN_MOMENTUM_BUY_VOL_ETH || 0.5),
  minMomentumBuyers: Number(process.env.MIN_MOMENTUM_BUYERS || 5),
  minBuySellRatio: Number(process.env.MIN_BUY_SELL_RATIO || 2.0),
  renotifyMcapGrowthPercent: Number(process.env.RENOTIFY_MCAP_GROWTH_PERCENT || 50),
  minOrganicBuyEth: Number(process.env.MIN_ORGANIC_BUY_ETH || 0.005),
  maxTop5HolderPercent: Number(process.env.MAX_TOP5_HOLDER_PERCENT || 45),
  maxMcapLiquidityRatio: Number(process.env.MAX_MCAP_LIQUIDITY_RATIO || 15),
};
