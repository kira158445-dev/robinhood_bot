import { SETTINGS } from "./config.js";

export async function sendWhatsAppNotification(launch, stats, type = "initial", momentumData = {}) {
  if (!SETTINGS.whatsappEnabled) {
    return;
  }

  const message =
    type === "momentum_update"
      ? formatMomentumWhatsAppMessage(launch, stats, momentumData)
      : formatWhatsAppMessage(launch, stats);

  try {
    if (SETTINGS.whatsappProvider === "twilio") {
      await sendTwilio(message);
    } else if (SETTINGS.whatsappProvider === "callmebot") {
      await sendCallMeBot(message);
    } else if (SETTINGS.whatsappProvider === "webhook") {
      await sendWebhook(message, launch, stats);
    } else {
      console.log(`[WhatsApp] Unknown provider: ${SETTINGS.whatsappProvider}`);
    }
  } catch (error) {
    console.error(`[WhatsApp] Notification error: ${error.message}`);
  }
}

export function formatWhatsAppMessage(launch, stats) {
  const symbol = launch.metadata?.symbol || "UNKNOWN";
  const name = launch.metadata?.name || "Unknown Token";
  const address = launch.token;
  const mcap = stats.marketCapUsd
    ? `$${stats.marketCapUsd.toLocaleString()}`
    : "N/A";
  const holders = stats.holdersSynced ? stats.holders.toLocaleString() : "Syncing...";
  const buyers = stats.uniqueBuyers || 0;
  const organicBuyers = stats.organicUniqueBuyers !== undefined ? `${stats.organicUniqueBuyers} organic` : `${buyers}`;
  const trades = `${stats.buyCount || 0} buys / ${stats.sellCount || 0} sells`;
  const buyVol = stats.buyVolumeEth ? `${stats.buyVolumeEth.toFixed(3)} ETH` : "0 ETH";
  const avgTrade = stats.avgBuySizeEth ? `${stats.avgBuySizeEth.toFixed(3)} ETH` : "0 ETH";
  const graduated = stats.graduated ? "YES ✅" : "NO ❌";

  const top5Badge = stats.isTop5Concentrated ? `⚠️ ${stats.top5HolderPercent.toFixed(1)}% (High)` : `🟢 ${stats.top5HolderPercent.toFixed(1)}% (Safe)`;
  const liqBadge = stats.isIlliquid ? `⚠️ Illiquid Pool (${stats.mcapToLiquidityRatio.toFixed(1)}x ratio)` : `🟢 Healthy (${stats.mcapToLiquidityRatio.toFixed(1)}x ratio)`;

  const socials = launch.metadata?.socials || {};
  const socialList = [];
  if (socials.twitter) socialList.push(`• Twitter: ${socials.twitter}`);
  if (socials.telegram) socialList.push(`• Telegram: ${socials.telegram}`);
  if (socials.website) socialList.push(`• Website: ${socials.website}`);
  if (socials.discord) socialList.push(`• Discord: ${socials.discord}`);
  if (socials.farcaster) socialList.push(`• Farcaster: ${socials.farcaster}`);

  const socialsText = socialList.length > 0 ? `\n🌐 *Socials:*\n${socialList.join("\n")}\n` : "";

  const isPons = launch.dexId !== "uniswap_v2";
  const title = isPons
    ? `🚨 *NEW MIGRATED TOKEN (> $${(SETTINGS.minMarketCapUsd / 1000).toFixed(0)}k MCap)* 🚨`
    : `🚨 *NEW ROBINHOOD TOKEN (> $${(SETTINGS.minNonPonsMarketCapUsd / 1000).toFixed(0)}k MCap)* 🚨`;

  return [
    title,
    ``,
    `📌 *Token:* ${symbol} (${name})`,
    `📝 *Address:* ${address}`,
    `📊 *Market Cap:* ${mcap}`,
    `🎓 *Migrated/Graduated:* ${graduated}`,
    `💰 *Avg Buy Size:* ${avgTrade}`,
    `👥 *Holders:* ${holders} | Top 5: ${top5Badge}`,
    `👤 *Buyers:* ${buyers} (${organicBuyers})`,
    `💧 *Liquidity:* ${liqBadge}`,
    `🔄 *Trades (5m):* ${trades}`,
    `💧 *Buy Vol (5m):* ${buyVol}`,
    `⭐ *Traction Score:* ${stats.score}/100`,
    socialsText,
    `🔗 *Explorer:*`,
    `https://explorer.mainnet.chain.robinhood.com/token/${address}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatMomentumWhatsAppMessage(launch, stats, momentumData = {}) {
  const symbol = launch.metadata?.symbol || "UNKNOWN";
  const name = launch.metadata?.name || "Unknown Token";
  const address = launch.token;
  const mcap = stats.marketCapUsd
    ? `$${stats.marketCapUsd.toLocaleString()}`
    : "N/A";
  const growth = momentumData.mcapGrowthPercent
    ? `+${momentumData.mcapGrowthPercent}% growth 📈`
    : "Gaining Momentum 🔥";
  const holders = stats.holdersSynced ? stats.holders.toLocaleString() : "Syncing...";
  const buyers = stats.uniqueBuyers || 0;
  const organicBuyers = stats.organicUniqueBuyers !== undefined ? `${stats.organicUniqueBuyers} organic` : `${buyers}`;
  const trades = `${stats.buyCount || 0} buys / ${stats.sellCount || 0} sells`;
  const buyVol = stats.buyVolumeEth ? `${stats.buyVolumeEth.toFixed(3)} ETH` : "0 ETH";
  const avgTrade = stats.avgBuySizeEth ? `${stats.avgBuySizeEth.toFixed(3)} ETH` : "0 ETH";

  const top5Badge = stats.isTop5Concentrated ? `⚠️ ${stats.top5HolderPercent.toFixed(1)}% (High)` : `🟢 ${stats.top5HolderPercent.toFixed(1)}% (Safe)`;

  const socials = launch.metadata?.socials || {};
  const socialList = [];
  if (socials.twitter) socialList.push(`• Twitter: ${socials.twitter}`);
  if (socials.telegram) socialList.push(`• Telegram: ${socials.telegram}`);
  if (socials.website) socialList.push(`• Website: ${socials.website}`);

  const socialsText = socialList.length > 0 ? `\n🌐 *Socials:*\n${socialList.join("\n")}\n` : "";

  const isPons = launch.dexId !== "uniswap_v2";
  const typeText = isPons ? "post-migration" : "on Uniswap V2";
  const alertText = `⚡ *${symbol} is gaining strong momentum ${typeText}!*`;

  return [
    `🔥 *MOMENTUM SURGE ALERT* 🔥`,
    alertText,
    ``,
    `📌 *Token:* ${symbol} (${name})`,
    `📝 *Address:* ${address}`,
    `📊 *Market Cap:* ${mcap} (${growth})`,
    `💰 *Avg Buy Size:* ${avgTrade}`,
    `⚡ *Buy Volume (5m):* ${buyVol}`,
    `👤 *Buyers:* ${buyers} (${organicBuyers})`,
    `🔄 *Buy/Sell Ratio:* ${stats.buySellRatio.toFixed(1)}x (${trades})`,
    `👥 *Holders:* ${holders} | Top 5: ${top5Badge}`,
    `⭐ *Score:* ${stats.score}/100`,
    socialsText,
    `🔗 *Explorer:*`,
    `https://explorer.mainnet.chain.robinhood.com/token/${address}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function sendTwilio(message) {
  const { twilioAccountSid, twilioAuthToken, twilioFromNumber, whatsappToNumber } = SETTINGS;

  if (!twilioAccountSid || !twilioAuthToken || !twilioFromNumber || !whatsappToNumber) {
    console.log("[WhatsApp] Missing Twilio environment variables.");
    return;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
  const credentials = Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString("base64");

  const params = new URLSearchParams();
  params.append("From", twilioFromNumber.startsWith("whatsapp:") ? twilioFromNumber : `whatsapp:${twilioFromNumber}`);
  params.append("To", whatsappToNumber.startsWith("whatsapp:") ? whatsappToNumber : `whatsapp:${whatsappToNumber}`);
  params.append("Body", message);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Twilio HTTP ${response.status}: ${text}`);
  }

  console.log(`[WhatsApp] Alert sent via Twilio!`);
}

async function sendCallMeBot(message) {
  const { callmebotPhone, callmebotApiKey } = SETTINGS;

  if (!callmebotPhone || !callmebotApiKey) {
    console.log("[WhatsApp] Missing CallMeBot credentials.");
    return;
  }

  const encodedMsg = encodeURIComponent(message);
  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(
    callmebotPhone,
  )}&text=${encodedMsg}&apikey=${encodeURIComponent(callmebotApiKey)}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`CallMeBot HTTP ${response.status}`);
  }

  console.log(`[WhatsApp] Alert sent via CallMeBot!`);
}

async function sendWebhook(message, launch, stats) {
  const { whatsappWebhookUrl } = SETTINGS;

  if (!whatsappWebhookUrl) {
    console.log("[WhatsApp] Missing WHATSAPP_WEBHOOK_URL.");
    return;
  }

  const response = await fetch(whatsappWebhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: message,
      launch,
      stats,
    }),
  });

  if (!response.ok) {
    throw new Error(`Webhook HTTP ${response.status}`);
  }

  console.log(`[WhatsApp] Alert sent via Webhook!`);
}
