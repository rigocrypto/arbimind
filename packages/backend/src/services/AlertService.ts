/**
 * Alert Dispatch Service
 * Sends predictions to Telegram, Discord, Twitter, and Reddit
 */

import { logger } from '../utils/logger';

export interface AlertWebhooks {
  telegram?: { token: string; chatId: string };
  discord?: string;
  twitter?: string;
  reddit?: { clientId: string; secret: string; subreddit: string };
}

export interface AlertPrediction {
  chain: string;
  pairAddress: string;
  signal: 'LONG' | 'SHORT' | 'NEUTRAL';
  confidence: number;
  entryPriceUsd?: number;
  reason: string;
  horizonSec?: number;
}

/**
 * Fetch Reddit OAuth2 token using client credentials
 */
async function getRedditToken(clientId: string, secret: string, userAgent: string): Promise<string | null> {
  try {
    const auth = Buffer.from(`${clientId}:${secret}`).toString('base64');
    const res = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': userAgent,
      },
      body: 'grant_type=client_credentials',
    });

    if (!res.ok) {
      logger.warn('Reddit token fetch failed', { status: res.status });
      return null;
    }

    const data = (await res.json()) as any;
    return data.access_token ?? null;
  } catch (error) {
    logger.debug('Reddit token error', {
      error: error instanceof Error ? error.message : error,
    });
    return null;
  }
}

/**
 * Send alert to Telegram
 */
async function sendTelegram(
  token: string,
  chatId: string,
  message: string
): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
      }),
    });

    if (!res.ok) {
      logger.warn('Telegram send failed', { status: res.status });
      return false;
    }

    return true;
  } catch (error) {
    logger.debug('Telegram error', {
      error: error instanceof Error ? error.message : error,
    });
    return false;
  }
}

/**
 * Send alert to Discord
 */
async function sendDiscord(webhookUrl: string, message: string): Promise<boolean> {
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: message,
        username: 'ArbiMind Bot',
        avatar_url: 'https://avatars.githubusercontent.com/u/1234567?v=4',
      }),
    });

    if (!res.ok) {
      logger.warn('Discord send failed', { status: res.status });
      return false;
    }

    return true;
  } catch (error) {
    logger.debug('Discord error', {
      error: error instanceof Error ? error.message : error,
    });
    return false;
  }
}

/**
 * Send alert to Twitter (X) API v2
 */
async function sendTwitter(bearerToken: string, message: string): Promise<boolean> {
  try {
    const res = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: message }),
    });

    if (!res.ok) {
      logger.warn('Twitter send failed', { status: res.status });
      return false;
    }

    return true;
  } catch (error) {
    logger.debug('Twitter error', {
      error: error instanceof Error ? error.message : error,
    });
    return false;
  }
}

/**
 * Send alert to Reddit as self-post
 */
async function sendReddit(
  token: string,
  clientId: string,
  secret: string,
  subreddit: string,
  userAgent: string,
  title: string,
  body: string
): Promise<boolean> {
  try {
    const res = await fetch('https://oauth.reddit.com/api/submit', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': userAgent,
      },
      body: new URLSearchParams({
        sr: subreddit,
        title: title.substring(0, 300), // Reddit title limit
        text: body.substring(0, 40000), // Reddit body limit
        kind: 'self',
      }).toString(),
    });

    if (!res.ok) {
      logger.warn('Reddit submit failed', { status: res.status });
      return false;
    }

    return true;
  } catch (error) {
    logger.debug('Reddit error', {
      error: error instanceof Error ? error.message : error,
    });
    return false;
  }
}

/**
 * Format alert message
 */
function formatAlertMessage(pred: AlertPrediction): string {
  const timestamp = new Date().toISOString();
  const pairShort = pred.pairAddress.substring(0, 12);
  const confidencePercent = (pred.confidence * 100).toFixed(1);

  // Telegram/Discord/Twitter compatible format
  return (
    `🚨 <b>ArbiMind Alert</b>\n` +
    `<b>Chain:</b> ${pred.chain}\n` +
    `<b>Pair:</b> ${pairShort}...\n` +
    `<b>Signal:</b> ${pred.signal} (${confidencePercent}%)\n` +
    `<b>Entry:</b> $${pred.entryPriceUsd?.toFixed(6) ?? 'N/A'}\n` +
    `<b>Reason:</b> ${pred.reason}\n` +
    `<b>Horizon:</b> ${(pred.horizonSec ?? 900) / 60}min\n` +
    `<b>Time:</b> ${timestamp}`
  );
}

/**
 * Dispatch alert to configured webhooks
 */
export async function dispatchAlert(pred: AlertPrediction, webhooks: AlertWebhooks): Promise<{
  telegram: boolean;
  discord: boolean;
  twitter: boolean;
  reddit: boolean;
}> {
  const minConfidence = parseFloat(process.env.ALERT_MIN_CONFIDENCE || '0.8');

  if (pred.confidence < minConfidence) {
    logger.debug('Prediction below confidence threshold; skipping alert', {
      confidence: pred.confidence,
      threshold: minConfidence,
    });
    return { telegram: false, discord: false, twitter: false, reddit: false };
  }

  const message = formatAlertMessage(pred);
  const results = {
    telegram: false,
    discord: false,
    twitter: false,
    reddit: false,
  };

  // Telegram
  if (webhooks.telegram?.token && webhooks.telegram?.chatId) {
    results.telegram = await sendTelegram(
      webhooks.telegram.token,
      webhooks.telegram.chatId,
      message
    );
    logger.info('Telegram alert dispatched', { success: results.telegram, pair: pred.pairAddress });
  }

  // Discord
  if (webhooks.discord) {
    results.discord = await sendDiscord(webhooks.discord, message);
    logger.info('Discord alert dispatched', { success: results.discord, pair: pred.pairAddress });
  }

  // Twitter
  if (webhooks.twitter) {
    results.twitter = await sendTwitter(webhooks.twitter, message);
    logger.info('Twitter alert dispatched', { success: results.twitter, pair: pred.pairAddress });
  }

  // Reddit
  if (webhooks.reddit?.clientId && webhooks.reddit?.secret && webhooks.reddit?.subreddit) {
    const redditToken = await getRedditToken(
      webhooks.reddit.clientId,
      webhooks.reddit.secret,
      process.env.ALERT_REDDIT_USER_AGENT || 'ArbiMind/1.0'
    );

    if (redditToken) {
      const title = `ArbiMind: ${pred.signal} ${pred.chain}:${pred.pairAddress.substring(0, 8)}...`;
      results.reddit = await sendReddit(
        redditToken,
        webhooks.reddit.clientId,
        webhooks.reddit.secret,
        webhooks.reddit.subreddit,
        process.env.ALERT_REDDIT_USER_AGENT || 'ArbiMind/1.0',
        title,
        message.replace(/<[^>]*>/g, '') // Remove HTML tags for Reddit
      );
      logger.info('Reddit alert dispatched', { success: results.reddit, pair: pred.pairAddress });
    }
  }

  return results;
}
