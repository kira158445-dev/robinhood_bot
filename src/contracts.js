import { decodeFunctionResult, encodeFunctionData, parseAbi } from "viem";

const tokenAbi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function logo() view returns (string)",
  "function description() view returns (string)",
  "function liquidityPool() view returns (address)",
  "function socials() view returns (string twitter, string telegram, string discord, string website, string farcaster)",
]);

const factoryAbi = parseAbi([
  "function graduationStatus(address token) view returns (uint256 pairedPrincipal, uint256 threshold, bool graduated)",
]);

export async function readTokenMetadata(client, token) {
  const [name, symbol, decimals, totalSupply, logo, description, liquidityPool, socials] =
    await Promise.all([
      readContract(client, token, tokenAbi, "name"),
      readContract(client, token, tokenAbi, "symbol"),
      readContract(client, token, tokenAbi, "decimals"),
      readContract(client, token, tokenAbi, "totalSupply"),
      readContract(client, token, tokenAbi, "logo"),
      readContract(client, token, tokenAbi, "description"),
      readContract(client, token, tokenAbi, "liquidityPool"),
      readContract(client, token, tokenAbi, "socials"),
    ]);

  return {
    name,
    symbol,
    decimals,
    totalSupply: totalSupply.toString(),
    logo,
    description,
    liquidityPool: liquidityPool.toLowerCase(),
    socials: {
      twitter: socials[0],
      telegram: socials[1],
      discord: socials[2],
      website: socials[3],
      farcaster: socials[4],
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
