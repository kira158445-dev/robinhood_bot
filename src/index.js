import {
  decodeSwap,
  decodeTokenLaunched,
  decodeTransfer,
  eventId,
  shortAddress,
} from "./abi.js";
import { EVENTS, PONS, SETTINGS } from "./config.js";
import { readGraduationStatus, readTokenMetadata } from "./contracts.js";
import { getLogsChunked, RpcClient } from "./rpc.js";
import http from "node:http";
import { loadState, saveState } from "./store.js";
import { scoreLaunch, evaluateMomentum } from "./scoring.js";
import { sendWhatsAppNotification } from "./whatsapp.js";

const client = new RpcClient(PONS.rpcUrl);
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Optional HTTP health check server for Render / Koyeb / Fly.io
const PORT = process.env.PORT;
if (PORT) {
  http
    .createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Robinhood Bot Active");
    })
    .listen(PORT, () => {
      console.log(`[HealthCheck] HTTP server listening on port ${PORT}`);
    });
}

async function main() {
  const state = await loadState(SETTINGS.stateFile);

  do {
    try {
      const warnings = await poll(state);
      await checkAndNotify(state);
      await saveState(SETTINGS.stateFile, state);
      printBoard(state, warnings);
    } catch (err) {
      // Never crash — log and keep going on next poll
      console.error(`[Bot] Poll cycle error (will retry): ${err.message}`);
    }

    if (SETTINGS.runOnce) {
      break;
    }

    await sleep(SETTINGS.pollIntervalMs);
  } while (true);
}

async function poll(state) {
  const warnings = [];

  // Wrap blockNumber in runStep so a 429 (after all retries) just logs a warning
  let latestBlock;
  await runStep(warnings, "block number", async () => {
    latestBlock = await client.blockNumber();
  });

  if (!latestBlock) {
    return warnings; // RPC still rate-limited — skip this poll cycle gracefully
  }

  await runStep(warnings, "active factory", () => indexFactory(state, PONS.activeFactory, latestBlock));
  await runStep(warnings, "legacy factory", () => indexFactory(state, PONS.legacyFactory, latestBlock));
  await runStep(warnings, "launch times", () => hydrateLaunchTimes(state));
  await runStep(warnings, "token reads", () => hydrateTokenReads(state));
  await runStep(warnings, "pool swaps", () => indexPoolSwaps(state, latestBlock));
  await runStep(warnings, "token transfers", () => indexTokenTransfers(state, latestBlock));

  return warnings;

}

async function indexFactory(state, factory, latestBlock) {
  const key = factory.toLowerCase();
  const configuredStartBlock = BigInt(state.factories[key].startBlock);
  const savedLastBlock = BigInt(state.factories[key].lastScannedBlock);
  const initialScan = savedLastBlock < configuredStartBlock;
  let cursor = savedLastBlock + 1n;

  if (initialScan && !SETTINGS.fullBackfill) {
    cursor = maxBigInt(cursor, latestBlock - SETTINGS.initialBackfillBlocks);
  }

  if (cursor > latestBlock) {
    return;
  }

  const logs = await getLogsChunked(
    client,
    {
      address: factory,
      fromBlock: cursor,
      toBlock: latestBlock,
      topics: [EVENTS.tokenLaunchedTopic],
    },
    SETTINGS.logChunkSize,
  );

  for (const log of logs) {
    const launch = decodeTokenLaunched(log);
    launch.sourceFactory = factory.toLowerCase();
    const timestamp = await getBlockTimestamp(state, BigInt(log.blockNumber));
    launch.launchTime = new Date(timestamp * 1000).toISOString();
    state.launches[launch.token] = launch;
    state.poolScanBlocks[launch.pool] ||= (BigInt(launch.launchBlock) - 1n).toString();
    state.tokenTransferScanBlocks[launch.token] ||= (BigInt(launch.launchBlock) - 1n).toString();
    state.tokenState[launch.token] ||= emptyTokenState();
  }

  state.factories[key].lastScannedBlock = latestBlock.toString();
}

async function indexPoolSwaps(state, latestBlock) {
  let scanned = 0;

  for (const launch of launchesNewestFirst(state)) {
    if (scanned >= SETTINGS.maxSwapPoolsPerPoll) {
      return;
    }

    const pool = launch.pool.toLowerCase();
    const fromBlock = BigInt(state.poolScanBlocks[pool] || launch.launchBlock) + 1n;

    if (fromBlock > latestBlock) {
      continue;
    }

    const logs = await getLogsChunked(
      client,
      {
        address: pool,
        fromBlock,
        toBlock: latestBlock,
        topics: [EVENTS.swapTopic],
      },
      SETTINGS.logChunkSize,
    );

    for (const log of logs) {
      const id = eventId(log);
      state.swaps[id] ||= decodeSwap(log, launch);
    }

    state.poolScanBlocks[pool] = latestBlock.toString();
    scanned += 1;
  }
}

async function indexTokenTransfers(state, latestBlock) {
  let scanned = 0;

  for (const launch of launchesNewestFirst(state)) {
    if (scanned >= SETTINGS.maxTransferTokensPerPoll) {
      return;
    }

    const token = launch.token.toLowerCase();
    const fromBlock = BigInt(state.tokenTransferScanBlocks[token] || launch.launchBlock) + 1n;

    if (fromBlock > latestBlock) {
      continue;
    }

    const logs = await getLogsChunked(
      client,
      {
        address: token,
        fromBlock,
        toBlock: latestBlock,
        topics: [EVENTS.transferTopic],
      },
      SETTINGS.logChunkSize,
    );

    state.tokenState[token] ||= emptyTokenState();

    for (const log of logs) {
      const id = eventId(log);
      if (!state.transfers[id]) {
        const transfer = decodeTransfer(log);
        state.transfers[id] = transfer;
        applyTransfer(state.tokenState[token], transfer);
      }
    }

    state.tokenTransferScanBlocks[token] = latestBlock.toString();
    state.tokenState[token].transfersSyncedToBlock = latestBlock.toString();
    scanned += 1;
  }
}

function printBoard(state, warnings = []) {
  const swapsByToken = groupSwapsByToken(Object.values(state.swaps));
  const transfersByToken = groupTransfersByToken(Object.values(state.transfers));
  const ranked = Object.values(state.launches)
    .map((launch) => ({
      launch,
      stats: scoreLaunch(
        launch,
        swapsByToken.get(launch.token) || [],
        transfersByToken.get(launch.token) || [],
        state.tokenState[launch.token],
      ),
    }))
    .sort((left, right) => right.stats.score - left.stats.score)
    .slice(0, 15);

  console.clear();
  console.log(`pons traction detector | ${new Date().toISOString()}`);
  if (warnings.length > 0) {
    console.log(`warning: ${warnings.join(" | ")}`);
  }

  if (ranked.length === 0) {
    console.log("No launches indexed yet.");
    return;
  }

  printTractionTable(ranked);
}

async function checkAndNotify(state) {
  const swapsByToken = groupSwapsByToken(Object.values(state.swaps));
  const transfersByToken = groupTransfersByToken(Object.values(state.transfers));

  for (const launch of Object.values(state.launches)) {
    const token = launch.token.toLowerCase();
    const stats = scoreLaunch(
      launch,
      swapsByToken.get(launch.token) || [],
      transfersByToken.get(launch.token) || [],
      state.tokenState[launch.token],
    );

    // Save rolling token snapshots (keep last 20 snapshots)
    state.tokenSnapshots[token] ||= [];
    const snapshots = state.tokenSnapshots[token];
    snapshots.push({
      timestamp: new Date().toISOString(),
      marketCapUsd: stats.marketCapUsd,
      buyVolumeEth: stats.buyVolumeEth,
      uniqueBuyers: stats.uniqueBuyers,
    });
    if (snapshots.length > 20) {
      snapshots.shift();
    }

    const momentumData = evaluateMomentum(stats, snapshots, launch);

    const isGraduated = !SETTINGS.requireGraduated || stats.graduated;
    const hasMinMcap = stats.marketCapUsd >= SETTINGS.minMarketCapUsd;

    // 1. Initial Notification (first time meeting mcap + graduation)
    if (isGraduated && hasMinMcap && !state.notifiedTokens[token]) {
      state.notifiedTokens[token] = new Date().toISOString();
      await sendWhatsAppNotification(launch, stats, "initial");
    }

    // 2. Momentum Surge Notification (for recently migrated tokens gaining strong momentum)
    if (isGraduated && hasMinMcap && momentumData.recentlyMigrated && momentumData.isGainingMomentum) {
      const momentumKey = `${token}:momentum`;
      const prevMomentumAlert = state.notifiedTokens[momentumKey];

      let shouldAlertMomentum = false;
      if (!prevMomentumAlert) {
        shouldAlertMomentum = true;
      } else {
        const lastMcap = typeof prevMomentumAlert === "object" ? prevMomentumAlert.marketCapUsd : 0;
        if (lastMcap > 0 && stats.marketCapUsd > 0) {
          const mcapGain = ((stats.marketCapUsd - lastMcap) / lastMcap) * 100;
          if (mcapGain >= SETTINGS.renotifyMcapGrowthPercent) {
            shouldAlertMomentum = true;
          }
        }
      }

      if (shouldAlertMomentum) {
        state.notifiedTokens[momentumKey] = {
          timestamp: new Date().toISOString(),
          marketCapUsd: stats.marketCapUsd,
        };
        await sendWhatsAppNotification(launch, stats, "momentum_update", momentumData);
      }
    }
  }
}

function printTractionTable(ranked) {
  const rows = ranked.map(({ launch, stats }, index) => ({
    "#": String(index + 1).padStart(2, "0"),
    token: displayToken(launch),
    score: String(stats.score).padStart(3, " "),
    mCap: stats.marketCapUsd ? `$${(stats.marketCapUsd / 1000).toFixed(1)}k` : "$0k",
    grad: `${stats.graduationProgress.toFixed(1)}%`,
    holders: stats.holdersSynced ? String(stats.holders) : "syncing",
    buyVol: `${stats.buyVolumeEth.toFixed(3)}`,
    avgBuy: stats.avgBuySizeEth ? `${stats.avgBuySizeEth.toFixed(3)}` : "0.00",
    buyers: String(stats.uniqueBuyers),
    trades: `${stats.buyCount}/${stats.sellCount}`,
    age: formatAge(launch.launchTime),
    flags: formatFlags(stats),
    address: launch.token,
  }));

  printTable(
    [
      ["#", 4],
      ["token", 13],
      ["score", 5],
      ["mCap", 8],
      ["grad", 6],
      ["holders", 7],
      ["buyVol", 8],
      ["avgBuy", 7],
      ["buyers", 6],
      ["B/S", 7, "trades"],
      ["age", 7],
      ["flags", 14],
      ["token address", 42, "address"],
    ],
    rows,
  );
}

function printTable(columns, rows) {
  const border = tableBorder(columns);
  const header = tableRow(columns, Object.fromEntries(columns.map(([name]) => [name, name])), true);

  console.log(border);
  console.log(header);
  console.log(border);

  for (const row of rows) {
    console.log(tableRow(columns, row));
  }

  console.log(border);
}

function tableBorder(columns) {
  return `+${columns.map(([, width]) => "-".repeat(width + 2)).join("+")}+`;
}

function tableRow(columns, row, useHeaderNames = false) {
  return `| ${columns
    .map(([name, width, key]) => fitCell(row[useHeaderNames ? name : key || name] || "", width))
    .join(" | ")} |`;
}

function fitCell(value, width) {
  const text = String(value);

  if (text.length > width) {
    return `${text.slice(0, Math.max(0, width - 3))}...`;
  }

  return text.padEnd(width, " ");
}

function displayToken(launch) {
  return launch.metadata?.symbol || shortAddress(launch.token);
}

function formatFlags(stats) {
  return [
    stats.largeWhaleSell ? "whale-sell" : "",
    stats.creatorSold ? "creator-sold" : "",
    stats.isTop5Concentrated ? "top5-heavy" : "",
    stats.isIlliquid ? "illiquid" : "",
    stats.graduated ? "graduated" : "",
  ]
    .filter(Boolean)
    .join(",");
}

function groupSwapsByToken(swaps) {
  const grouped = new Map();

  for (const swap of swaps) {
    const tokenSwaps = grouped.get(swap.token) || [];
    tokenSwaps.push(swap);
    grouped.set(swap.token, tokenSwaps);
  }

  return grouped;
}

function groupTransfersByToken(transfers) {
  const grouped = new Map();

  for (const transfer of transfers) {
    const tokenTransfers = grouped.get(transfer.token) || [];
    tokenTransfers.push(transfer);
    grouped.set(transfer.token, tokenTransfers);
  }

  return grouped;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runStep(warnings, label, step) {
  try {
    await step();
  } catch (error) {
    warnings.push(`${label}: ${error.message}`);
  }
}

function formatAge(isoTime) {
  if (!isoTime) {
    return "unknown";
  }

  const elapsedMs = Date.now() - new Date(isoTime).getTime();
  const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));

  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s ago`;
  }

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  return `${elapsedHours}h ago`;
}

async function getBlockTimestamp(state, blockNumber) {
  const key = blockNumber.toString();

  if (!state.blockTimestamps[key]) {
    const block = await client.blockByNumber(blockNumber);
    state.blockTimestamps[key] = Number(BigInt(block.timestamp));
  }

  return state.blockTimestamps[key];
}

async function hydrateLaunchTimes(state) {
  for (const launch of launchesNewestFirst(state)) {
    if (!launch.launchTime) {
      const timestamp = await getBlockTimestamp(state, BigInt(launch.launchBlock));
      launch.launchTime = new Date(timestamp * 1000).toISOString();
    }
  }
}

async function hydrateTokenReads(state) {
  let remaining = SETTINGS.maxContractReadsPerPoll;

  for (const launch of launchesNewestFirst(state)) {
    if (remaining <= 0) {
      return;
    }

    if (!launch.metadata) {
      try {
        launch.metadata = await readTokenMetadata(client, launch.token);
        remaining -= 1;
      } catch (error) {
        launch.metadataError = error.message;
      }
    }

    if (remaining <= 0) {
      return;
    }

    try {
      const factory = launch.sourceFactory || PONS.activeFactory;
      launch.graduation = await readGraduationStatus(client, factory, launch.token);
      remaining -= 1;
    } catch (error) {
      launch.graduationError = error.message;
    }
  }
}

function emptyTokenState() {
  return {
    balances: {},
  };
}

function launchesNewestFirst(state) {
  return Object.values(state.launches).sort(
    (left, right) => Number(BigInt(right.launchBlock) - BigInt(left.launchBlock)),
  );
}

function applyTransfer(tokenState, transfer) {
  if (transfer.from !== ZERO_ADDRESS) {
    addBalance(tokenState.balances, transfer.from, -BigInt(transfer.value));
  }

  if (transfer.to !== ZERO_ADDRESS) {
    addBalance(tokenState.balances, transfer.to, BigInt(transfer.value));
  }
}

function addBalance(balances, holder, delta) {
  const next = BigInt(balances[holder] || "0") + delta;

  if (next <= 0n) {
    delete balances[holder];
  } else {
    balances[holder] = next.toString();
  }
}

function maxBigInt(left, right) {
  return left > right ? left : right;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
