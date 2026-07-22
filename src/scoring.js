import { PONS, SETTINGS } from "./config.js";

export function scoreLaunch(launch, swaps, transfers = [], tokenState = {}, now = Date.now()) {
  const windowStart = now - SETTINGS.scoreWindowMs;
  const recent = swaps.filter((swap) => swap.observedAt >= windowStart);
  const recentTransfers = transfers.filter((transfer) => transfer.observedAt >= windowStart);
  const buys = recent.filter((swap) => swap.side === "buy");
  const sells = recent.filter((swap) => swap.side === "sell");
  const buyVolumeEth = sum(buys.map((swap) => swap.pairAmountEth));
  const sellVolumeEth = sum(sells.map((swap) => swap.pairAmountEth));
  const uniqueBuyers = new Set(buys.map((swap) => swap.recipient)).size;
  const largeWhaleSell = sells.some((swap) => swap.pairAmountEth >= SETTINGS.whaleSellEth);
  const creatorSold = sells.some(
    (swap) => swap.sender.toLowerCase() === launch.creator.toLowerCase(),
  );
  const buySellRatio = buys.length / Math.max(1, sells.length);
  const liquidityEth = launch.poolWethBalance
    ? Number(BigInt(launch.poolWethBalance)) / 1e18
    : estimateCurrentPairLiquidity(swaps);
  const graduationProgress =
    launch.graduation?.progress ??
    Math.min(100, (liquidityEth / PONS.defaultGraduationThresholdEth) * 100);
  const holders = countHolders(tokenState);
  const holdersSynced = Boolean(tokenState?.transfersSyncedToBlock);
  const holderGrowth = countNewRecipients(recentTransfers);
  const concentration = walletConcentration(tokenState, launch);
  const socialLinksPresent = launch.metadata?.socialLinksPresent || 0;
  const graduated = Boolean(launch.graduation?.graduated);
  const marketCapUsd = estimateMarketCapUsd(launch, swaps);

  const organicBuys = buys.filter((swap) => swap.pairAmountEth >= (SETTINGS.minOrganicBuyEth || 0.005));
  const organicUniqueBuyers = new Set(organicBuys.map((swap) => swap.recipient)).size;
  const avgBuySizeEth = buys.length > 0 ? buyVolumeEth / buys.length : 0;
  const liquidityUsd = liquidityEth * (SETTINGS.ethPriceUsd || 1800);
  const mcapToLiquidityRatio = liquidityUsd > 0 ? marketCapUsd / liquidityUsd : 0;
  const isIlliquid = mcapToLiquidityRatio > (SETTINGS.maxMcapLiquidityRatio || 15);
  const isTop5Concentrated = concentration.top5HolderPercent >= (SETTINGS.maxTop5HolderPercent || 45);

  let score = 0;
  score += clamp((buyVolumeEth / 2) * 30, 0, 30);
  score += clamp((organicUniqueBuyers / 30) * 20, 0, 20);
  score += clamp((avgBuySizeEth / 0.1) * 10, 0, 10);
  score += clamp((graduationProgress / 100) * 15, 0, 15);
  score += clamp((buySellRatio / 5) * 10, 0, 10);
  score += clamp((holderGrowth / 50) * 10, 0, 10);
  score += clamp((socialLinksPresent / 5) * 5, 0, 5);

  if (largeWhaleSell) score -= 30;
  if (creatorSold) score -= 20;
  if (concentration.topHolderPercent >= 25) score -= 10;
  if (isTop5Concentrated) score -= 15;
  if (isIlliquid) score -= 15;

  const stats = {
    score: Math.round(clamp(score, 0, 100)),
    marketCapUsd,
    buyVolumeEth,
    sellVolumeEth,
    buyCount: buys.length,
    sellCount: sells.length,
    uniqueBuyers,
    organicUniqueBuyers,
    avgBuySizeEth,
    buySellRatio,
    liquidityEth,
    mcapToLiquidityRatio,
    isIlliquid,
    graduationProgress,
    graduated,
    holders,
    holdersSynced,
    holderGrowth,
    topHolderPercent: concentration.topHolderPercent,
    top5HolderPercent: concentration.top5HolderPercent,
    isTop5Concentrated,
    largeWhaleSell,
    creatorSold,
  };

  return stats;
}

export function evaluateMomentum(stats, snapshots = [], launch = {}) {
  const launchTime = launch.launchTime ? new Date(launch.launchTime).getTime() : 0;
  const ageHours = launchTime ? (Date.now() - launchTime) / (1000 * 60 * 60) : 0;
  const recentlyMigrated = stats.graduated && (ageHours === 0 || ageHours <= SETTINGS.maxMigrationAgeHours);

  const hasBuyVolume = stats.buyVolumeEth >= SETTINGS.minMomentumBuyVolEth;
  const hasBuyers = (stats.organicUniqueBuyers || stats.uniqueBuyers) >= SETTINGS.minMomentumBuyers;
  const hasBuyPressure = stats.buySellRatio >= SETTINGS.minBuySellRatio;

  let mcapGrowthPercent = 0;
  if (snapshots.length > 0) {
    const prevMcap = snapshots[snapshots.length - 1].marketCapUsd || 0;
    if (prevMcap > 0 && stats.marketCapUsd > 0) {
      mcapGrowthPercent = Math.round(((stats.marketCapUsd - prevMcap) / prevMcap) * 100);
    }
  }
  const hasMcapGrowth = mcapGrowthPercent >= 20;

  const isPons = launch.dexId !== "uniswap_v2";
  const minMcapThreshold = isPons ? SETTINGS.minMarketCapUsd : (SETTINGS.minNonPonsMarketCapUsd || 70000);

  const momentumSignals = [hasBuyVolume, hasBuyers, hasBuyPressure, hasMcapGrowth].filter(Boolean).length;
  const isGainingMomentum = stats.graduated && stats.marketCapUsd >= minMcapThreshold && momentumSignals >= 2;

  return {
    recentlyMigrated,
    isGainingMomentum,
    momentumSignals,
    mcapGrowthPercent,
    hasBuyVolume,
    hasBuyers,
    hasBuyPressure,
    hasMcapGrowth,
  };
}

export function estimateMarketCapUsd(launch, swaps = []) {
  const ethPrice = SETTINGS.ethPriceUsd || 1800;
  const decimals = Number(launch.metadata?.decimals || 18);

  if (!launch.metadata?.totalSupply) {
    const pairedEth = Number(launch.graduation?.pairedPrincipal || 0) / 1e18;
    return Math.round(pairedEth * 2 * ethPrice);
  }

  const totalSupplyTokens = Number(BigInt(launch.metadata.totalSupply)) / 10 ** decimals;

  for (let i = swaps.length - 1; i >= 0; i--) {
    const swap = swaps[i];
    const tokenAmountRaw = BigInt(swap.tokenAmountRaw || "0");
    if (swap.pairAmountEth > 0 && tokenAmountRaw > 0n) {
      const tokenAmount = Number(tokenAmountRaw) / 10 ** decimals;
      if (tokenAmount > 0) {
        const priceInEth = swap.pairAmountEth / tokenAmount;
        const mcapUsd = totalSupplyTokens * priceInEth * ethPrice;
        if (Number.isFinite(mcapUsd) && mcapUsd >= 0) {
          return Math.round(mcapUsd);
        }
      }
    }
  }

  const pairedEth = Number(launch.poolWethBalance || 0) / 1e18 || Number(launch.graduation?.pairedPrincipal || 0) / 1e18 || estimateCurrentPairLiquidity(swaps);
  return Math.round(pairedEth * 2 * ethPrice);
}

function estimateCurrentPairLiquidity(swaps) {
  return swaps.reduce((liquidity, swap) => {
    const signedPairAmount = Number(swap.pairAmount) / 1e18;
    return Math.max(0, liquidity + signedPairAmount);
  }, 0);
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function countHolders(tokenState) {
  return Object.keys(tokenState?.balances || {}).length;
}

function countNewRecipients(transfers) {
  const recipients = transfers
    .filter((transfer) => transfer.to !== "0x0000000000000000000000000000000000000000")
    .map((transfer) => transfer.to);
  return new Set(recipients).size;
}

function walletConcentration(tokenState, launch) {
  const balances = Object.entries(tokenState?.balances || {}).filter(
    ([address]) => address !== launch.pool?.toLowerCase(),
  );

  if (balances.length === 0 || !launch.metadata?.totalSupply) {
    return { topHolderPercent: 0, top5HolderPercent: 0 };
  }

  const totalSupply = BigInt(launch.metadata.totalSupply);
  if (totalSupply === 0n) {
    return { topHolderPercent: 0, top5HolderPercent: 0 };
  }

  const sortedBalances = balances
    .map(([, bal]) => BigInt(bal))
    .sort((a, b) => (b > a ? 1 : b < a ? -1 : 0));

  const topBalance = sortedBalances[0] || 0n;
  const top5Balance = sortedBalances.slice(0, 5).reduce((sum, b) => sum + b, 0n);

  return {
    topHolderPercent: Number((topBalance * 10000n) / totalSupply) / 100,
    top5HolderPercent: Number((top5Balance * 10000n) / totalSupply) / 100,
  };
}
