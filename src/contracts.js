import { decodeFunctionResult, encodeFunctionData, parseAbi } from "viem";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const tokenAbi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function logo() view returns (string)",
  "function description() view returns (string)",
  "function liquidityPool() view returns (address)",
  "function socials() view returns (string twitter, string telegram, string discord, string website, string farcaster)",
  "function balanceOf(address account) view returns (uint256)",
]);

const factoryAbi = parseAbi([
  "function graduationStatus(address token) view returns (uint256 pairedPrincipal, uint256 threshold, bool graduated)",
]);

export async function readTokenMetadata(client, token) {
  const safeRead = async (fn, fallback) => {
    try {
      return await readContract(client, token, tokenAbi, fn);
    } catch {
      return fallback;
    }
  };

  const [name, symbol, decimals, totalSupply] = await Promise.all([
    safeRead("name", "Unknown"),
    safeRead("symbol", "UNKNOWN"),
    safeRead("decimals", 18),
    safeRead("totalSupply", 0n),
  ]);

  const logo = await safeRead("logo", "");
  const description = await safeRead("description", "");
  const liquidityPool = await safeRead("liquidityPool", ZERO_ADDRESS);
  const socials = await safeRead("socials", ["", "", "", "", ""]);

  return {
    name,
    symbol,
    decimals: Number(decimals),
    totalSupply: totalSupply.toString(),
    logo,
    description,
    liquidityPool: liquidityPool.toLowerCase(),
    socials: {
      twitter: socials[0] || "",
      telegram: socials[1] || "",
      discord: socials[2] || "",
      website: socials[3] || "",
      farcaster: socials[4] || "",
    },
    socialLinksPresent: socials.filter(Boolean).length,
  };
}

export async function readGraduationStatus(client, factory, token) {
  const [pairedPrincipal, threshold, graduated] = await readContract(
    client,
    factory,
    factoryAbi,
    "graduationStatus",
    [token],
  );

  return {
    pairedPrincipal: pairedPrincipal.toString(),
    threshold: threshold.toString(),
    graduated,
    progress:
      threshold === 0n ? 0 : Math.min(100, (Number(pairedPrincipal) / Number(threshold)) * 100),
  };
}

async function readContract(client, address, abi, functionName, args = []) {
  const data = encodeFunctionData({ abi, functionName, args });
  const result = await client.ethCall({ to: address, data });
  return decodeFunctionResult({ abi, functionName, data: result });
}

export async function readWethBalance(client, wethAddress, poolAddress) {
  try {
    const balance = await readContract(client, wethAddress, tokenAbi, "balanceOf", [poolAddress]);
    return balance.toString();
  } catch {
    return "0";
  }
}

