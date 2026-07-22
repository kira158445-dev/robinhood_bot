import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { PONS, UNISWAP_V2 } from "./config.js";

export async function loadState(path) {
  try {
    const raw = await readFile(path, "utf8");
    return normalizeState(JSON.parse(raw));
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
    return normalizeState({});
  }
}

export async function saveState(path, state) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2));
}

export function normalizeState(state) {
  const v2FactoryKey = UNISWAP_V2.factory.toLowerCase();
  return {
    factories: {
      [PONS.activeFactory.toLowerCase()]: {
        startBlock: PONS.activeFactoryStartBlock.toString(),
        lastScannedBlock:
          state.factories?.[PONS.activeFactory.toLowerCase()]?.lastScannedBlock ||
          (PONS.activeFactoryStartBlock - 1n).toString(),
      },
      [PONS.legacyFactory.toLowerCase()]: {
        startBlock: PONS.legacyFactoryStartBlock.toString(),
        lastScannedBlock:
          state.factories?.[PONS.legacyFactory.toLowerCase()]?.lastScannedBlock ||
          (PONS.legacyFactoryStartBlock - 1n).toString(),
      },
      [v2FactoryKey]: {
        startBlock: UNISWAP_V2.factoryStartBlock.toString(),
        lastScannedBlock:
          state.factories?.[v2FactoryKey]?.lastScannedBlock ||
          (UNISWAP_V2.factoryStartBlock - 1n).toString(),
      },
    },
    launches: state.launches || {},
    swaps: state.swaps || {},
    transfers: state.transfers || {},
    tokenState: state.tokenState || {},
    poolScanBlocks: state.poolScanBlocks || {},
    tokenTransferScanBlocks: state.tokenTransferScanBlocks || {},
    blockTimestamps: state.blockTimestamps || {},
    notifiedTokens: state.notifiedTokens || {},
    tokenSnapshots: state.tokenSnapshots || {},
  };
}
