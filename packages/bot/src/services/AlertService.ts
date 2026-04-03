import { Logger } from '../utils/Logger';

interface DiscordEmbed {
  title: string;
  description?: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  timestamp?: string;
}

const COLOR_GREEN = 0x00cc66;
const COLOR_RED = 0xcc0000;
const COLOR_YELLOW = 0xffcc00;
const COLOR_BLUE = 0x3399ff;

export class AlertService {
  private webhookUrl: string | undefined;
  private logger: Logger;

  constructor(webhookUrl?: string) {
    this.webhookUrl = webhookUrl;
    this.logger = new Logger('AlertService');
    if (webhookUrl) {
      this.logger.info('Discord alert webhook configured');
    }
  }

  private async send(embeds: DiscordEmbed[]): Promise<void> {
    if (!this.webhookUrl) return;
    try {
      const res = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds }),
      });
      if (!res.ok) {
        this.logger.debug('Discord webhook returned non-OK', { status: res.status });
      }
    } catch (error) {
      this.logger.debug('Discord webhook failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async tradeExecuted(details: {
    pair: string;
    route: string;
    netProfit: string;
    hash: string;
    gasUsed: string;
  }): Promise<void> {
    await this.send([{
      title: '✅ Trade Executed',
      color: COLOR_GREEN,
      fields: [
        { name: 'Pair', value: details.pair, inline: true },
        { name: 'Route', value: details.route, inline: true },
        { name: 'Net Profit', value: details.netProfit, inline: true },
        { name: 'Tx Hash', value: details.hash, inline: false },
        { name: 'Gas Used', value: details.gasUsed, inline: true },
      ],
      timestamp: new Date().toISOString(),
    }]);
  }

  async tradeFailed(details: {
    pair: string;
    route: string;
    error: string;
  }): Promise<void> {
    await this.send([{
      title: '❌ Trade Failed',
      color: COLOR_RED,
      fields: [
        { name: 'Pair', value: details.pair, inline: true },
        { name: 'Route', value: details.route, inline: true },
        { name: 'Error', value: details.error, inline: false },
      ],
      timestamp: new Date().toISOString(),
    }]);
  }

  async guardBlocked(details: {
    pair: string;
    route: string;
    guard: string;
    reason: string;
  }): Promise<void> {
    await this.send([{
      title: '🛡️ Guard Blocked Trade',
      color: COLOR_YELLOW,
      fields: [
        { name: 'Pair', value: details.pair, inline: true },
        { name: 'Route', value: details.route, inline: true },
        { name: 'Guard', value: details.guard, inline: true },
        { name: 'Reason', value: details.reason, inline: false },
      ],
      timestamp: new Date().toISOString(),
    }]);
  }

  async botStopped(reason: string): Promise<void> {
    await this.send([{
      title: '🛑 Bot Stopped',
      color: COLOR_RED,
      fields: [
        { name: 'Reason', value: reason, inline: false },
      ],
      timestamp: new Date().toISOString(),
    }]);
  }

  async info(title: string, message: string): Promise<void> {
    await this.send([{
      title: `ℹ️ ${title}`,
      color: COLOR_BLUE,
      description: message,
      timestamp: new Date().toISOString(),
    }]);
  }
}
