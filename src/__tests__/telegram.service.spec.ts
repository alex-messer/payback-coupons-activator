import { test, expect } from "@playwright/test";
import { TelegramService } from "../services/telegram.service";

const OWNER_CHAT = "111";
const FOREIGN_CHAT = 222;

type FetchCall = { url: string; body?: Record<string, unknown> };

const originalFetch = globalThis.fetch;
const originalEnv = { token: process.env.TELEGRAM_BOT_TOKEN, chat: process.env.TELEGRAM_CHAT_ID };

let calls: FetchCall[] = [];

function stubFetch(respond: (url: string) => Response = () => okJson({ ok: true, result: [] })): void {
  calls = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined });
    return respond(url);
  }) as typeof fetch;
}

function okJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function setEnv(token: string | undefined, chat: string | undefined): void {
  if (token === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
  else process.env.TELEGRAM_BOT_TOKEN = token;
  if (chat === undefined) delete process.env.TELEGRAM_CHAT_ID;
  else process.env.TELEGRAM_CHAT_ID = chat;
}

test.beforeEach(() => {
  setEnv("test-token", OWNER_CHAT);
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  setEnv(originalEnv.token, originalEnv.chat);
});

test("isConfigured is false when the bot token or chat id is missing", () => {
  setEnv(undefined, OWNER_CHAT);
  expect(new TelegramService().isConfigured).toBe(false);

  setEnv("test-token", undefined);
  expect(new TelegramService().isConfigured).toBe(false);

  setEnv("test-token", OWNER_CHAT);
  expect(new TelegramService().isConfigured).toBe(true);
});

test("send is a no-op without configuration", async () => {
  setEnv(undefined, undefined);
  stubFetch();

  await new TelegramService().send("hello");

  expect(calls).toHaveLength(0);
});

test("send posts the message to the owner chat in Markdown", async () => {
  stubFetch();

  await new TelegramService().send("*PAYBACK Coupons*\n5 Coupons aktiviert.");

  const sendCall = calls.find(call => call.url.endsWith("/sendMessage"));
  expect(sendCall?.url).toBe("https://api.telegram.org/bottest-token/sendMessage");
  expect(sendCall?.body).toEqual({
    chat_id: OWNER_CHAT,
    text: "*PAYBACK Coupons*\n5 Coupons aktiviert.",
    parse_mode: "Markdown",
  });
});

test("send deletes messages from foreign chats and acknowledges updates", async () => {
  stubFetch(url => {
    if (url.endsWith("/getUpdates")) {
      return okJson({
        ok: true,
        result: [
          { update_id: 10, message: { chat: { id: FOREIGN_CHAT }, message_id: 55 } },
          { update_id: 11, message: { chat: { id: Number(OWNER_CHAT) }, message_id: 56 } },
        ],
      });
    }
    return okJson({ ok: true });
  });

  await new TelegramService().send("hi");

  const deleteCalls = calls.filter(call => call.url.endsWith("/deleteMessage"));
  expect(deleteCalls).toHaveLength(1);
  expect(deleteCalls[0].body).toEqual({ chat_id: FOREIGN_CHAT, message_id: 55 });

  const ackUrls = calls.filter(call => call.url.includes("/getUpdates?offset=")).map(call => call.url);
  expect(ackUrls).toEqual(expect.arrayContaining([expect.stringContaining("offset=11")]));
  expect(ackUrls).toEqual(expect.arrayContaining([expect.stringContaining("offset=12")]));
});

test("send logs but does not throw when the Telegram API rejects the message", async () => {
  stubFetch(url => (url.endsWith("/sendMessage") ? okJson({ ok: false }, 500) : okJson({ ok: true, result: [] })));
  const errors: string[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => errors.push(args.map(String).join(" "));

  try {
    await expect(new TelegramService().send("hi")).resolves.toBeUndefined();
  } finally {
    console.error = originalError;
  }

  expect(errors.join("\n")).toContain("Telegram API error: 500");
});

test("send stops after a failed getUpdates without deleting anything", async () => {
  stubFetch(url => (url.endsWith("/getUpdates") ? okJson({ ok: false }, 500) : okJson({ ok: true })));

  await new TelegramService().send("hi");

  expect(calls.some(call => call.url.endsWith("/deleteMessage"))).toBe(false);
});
