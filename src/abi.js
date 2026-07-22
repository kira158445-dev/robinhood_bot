const WORD_BYTES = 32;
const HEX_WORD_LENGTH = WORD_BYTES * 2;

export function decodeTokenLaunched(log) {
  const words = splitWords(log.data);

  return {
    token: topicAddress(log.topics[1]),
    creator: topicAddress(log.topics[2]),
    dexFactory: topicAddress(log.topics[3]),
    pairToken: wordAddress(words[0]),
    pool: wordAddress(words[1]),
    dexId: unsigned(words[2]).toString(),
    launchConfigId: unsigned(words[3]).toString(),
    positionId: unsigned(words[4]).toString(),
    restrictionsEndBlock: unsigned(words[5]).toString(),
    initialBuyAmount: unsigned(words[6]).toString(),
    launchBlock: BigInt(log.blockNumber).toString(),
    launchTx: log.transactionHash,
  };
}

export function decodeSwap(log, launch) {
  const words = splitWords(log.data);
  const amount0 = signed(words[0]);
  const amount1 = signed(words[1]);
  const tokenIsToken0 = addressBigInt(launch.token) < addressBigInt(launch.pairToken);
  const pairAmount = tokenIsToken0 ? amount1 : amount0;
  const tokenAmount = tokenIsToken0 ? amount0 : amount1;

  return {
    token: launch.token,
    pool: launch.pool,
    sender: topicAddress(log.topics[1]),
    recipient: topicAddress(log.topics[2]),
    amount0: amount0.toString(),
    amount1: amount1.toString(),
    pairAmount: pairAmount.toString(),
    tokenAmount: tokenAmount.toString(),
    side: pairAmount > 0n ? "buy" : "sell",
    pairAmountEth: weiToEth(abs(pairAmount)),
    tokenAmountRaw: abs(tokenAmount).toString(),
    blockNumber: BigInt(log.blockNumber).toString(),
    transactionHash: log.transactionHash,
    logIndex: Number(BigInt(log.logIndex)),
    observedAt: Date.now(),
  };
}

export function decodeTransfer(log) {
  return {
    token: log.address.toLowerCase(),
    from: topicAddress(log.topics[1]),
    to: topicAddress(log.topics[2]),
    value: unsigned(strip0x(log.data)).toString(),
    blockNumber: BigInt(log.blockNumber).toString(),
    transactionHash: log.transactionHash,
    logIndex: Number(BigInt(log.logIndex)),
    observedAt: Date.now(),
  };
}

export function eventId(log) {
  return `${log.transactionHash}:${Number(BigInt(log.logIndex))}`;
}

export function shortAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function splitWords(data) {
  const clean = data.startsWith("0x") ? data.slice(2) : data;
  const words = [];

  for (let index = 0; index < clean.length; index += HEX_WORD_LENGTH) {
    words.push(clean.slice(index, index + HEX_WORD_LENGTH));
  }

  return words;
}

function topicAddress(topic) {
  return `0x${topic.slice(-40)}`.toLowerCase();
}

function wordAddress(word) {
  return `0x${word.slice(-40)}`.toLowerCase();
}

function unsigned(word) {
  return BigInt(`0x${word}`);
}

function signed(word) {
  const value = unsigned(word);
  const limit = 1n << 255n;
  const modulo = 1n << 256n;
  return value >= limit ? value - modulo : value;
}

function abs(value) {
  return value < 0n ? -value : value;
}

function addressBigInt(address) {
  return BigInt(address.toLowerCase());
}

function weiToEth(wei) {
  return Number(wei) / 1e18;
}

function strip0x(value) {
  return value.startsWith("0x") ? value.slice(2) : value;
}
