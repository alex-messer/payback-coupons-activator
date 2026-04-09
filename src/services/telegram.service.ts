const TELEGRAM_API = "https://api.telegram.org";

export class TelegramService {
  private readonly botToken: string;
  private readonly ownerChatId: string;

  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
    this.ownerChatId = process.env.TELEGRAM_CHAT_ID ?? "";
  }

  get isConfigured(): boolean {
    return this.botToken !== "" && this.ownerChatId !== "";
  }

  async send(message: string): Promise<void> {
    if (!this.isConfigured) {
      console.log("Telegram not configured, skipping notification.");
      return;
    }

    await this.sendToOwner(message);
    await this.deleteUnauthorizedMessages();
  }

  private async sendToOwner(message: string): Promise<void> {
    const url = `${TELEGRAM_API}/bot${this.botToken}/sendMessage`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: this.ownerChatId,
        text: message,
        parse_mode: "Markdown",
      }),
    });

    if (!response.ok) {
      console.error(`Telegram API error: ${response.status} ${response.statusText}`);
    }
  }

  private async deleteUnauthorizedMessages(): Promise<void> {
    const url = `${TELEGRAM_API}/bot${this.botToken}/getUpdates`;
    const response = await fetch(url);

    if (!response.ok) return;

    const data = (await response.json()) as {
      result: Array<{
        update_id: number;
        message?: { chat: { id: number }; message_id: number };
      }>;
    };

    for (const update of data.result) {
      const msg = update.message;
      if (!msg) continue;

      if (String(msg.chat.id) !== this.ownerChatId) {
        // Delete message from unauthorized user
        await fetch(`${TELEGRAM_API}/bot${this.botToken}/deleteMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: msg.chat.id,
            message_id: msg.message_id,
          }),
        });
      }

      // Acknowledge update so it's not processed again
      await fetch(`${TELEGRAM_API}/bot${this.botToken}/getUpdates?offset=${update.update_id + 1}`);
    }
  }
}
