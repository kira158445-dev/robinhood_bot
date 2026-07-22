import { SETTINGS } from "./config.js";

let nextId = 1;

export class RpcClient {
  constructor(url) {
    this.url = url;
  }

  async call(method, params = []) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SETTINGS.rpcTimeoutMs);

    const response = await fetch(this.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: nextId++,
        method,
        params,
      }),
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      throw new Error(`RPC HTTP ${response.status} for ${method}`);
    }

    const payload = await response.json();
    if (payload.error) {
      throw new Error(`RPC ${method} failed: ${payload.error.message}`);
    }

    return payload.result;
  }

  async blockNumber() {
    return BigInt(await this.call("eth_blockNumber"));
  }

  async blockByNumber(blockNumber) {
    return this.call("eth_getBlockByNumber", [toHex(blockNumber), false]);
  }

  async getLogs({ address, fromBlock, toBlock, topics }) {
    return this.call("eth_getLogs", [
      {
        address,
        fromBlock: toHex(fromBlock),
        toBlock: toHex(toBlock),
        topics,
      },
    ]);
  }

  async ethCall({ to, data }, blockTag = "latest") {
    return this.call("eth_call", [{ to, data }, blockTag]);
  }
}

export async function getLogsChunked(client, query, chunkSize) {
  const logs = [];
  let cursor = query.fromBlock;

  while (cursor <= query.toBlock) {
    const end = minBigInt(cursor + chunkSize - 1n, query.toBlock);
    const chunk = await client.getLogs({
      ...query,
      fromBlock: cursor,
      toBlock: end,
    });
    logs.push(...chunk);
    cursor = end + 1n;
  }

  return logs;
}

export function toHex(value) {
  return `0x${BigInt(value).toString(16)}`;
}

function minBigInt(left, right) {
  return left < right ? left : right;
}
