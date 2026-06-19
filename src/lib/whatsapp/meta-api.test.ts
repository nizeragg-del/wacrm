import { describe, expect, it, vi } from "vitest";
import {
  sendInteractiveButtons,
  sendInteractiveList,
} from "./meta-api";

const BASE_ARGS = {
  phoneNumberId: "test-phone",
  accessToken: "test-token",
  to: "1234567890",
  bodyText: "Body text",
} as const;

describe("sendInteractiveButtons - Evolution API payload", () => {
  it("sends the documented Evolution buttons payload", async () => {
    let captured: { url: string; body: unknown } | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        captured = { url, body: JSON.parse(String(init.body)) };
        return new Response(
          JSON.stringify({ key: { id: "evo-msg-123" } }),
          { status: 201 },
        );
      }),
    );

    const result = await sendInteractiveButtons({
      ...BASE_ARGS,
      headerText: "Hello",
      footerText: "Tap one",
      buttons: [
        { id: "yes", title: "Yes" },
        { id: "no", title: "No" },
      ],
    });

    expect(result).toEqual({ messageId: "evo-msg-123" });
    expect(captured).not.toBeNull();
    expect(captured!.url).toContain("/message/sendButtons/test-phone");
    expect(captured!.body).toMatchObject({
      number: "1234567890@s.whatsapp.net",
      title: "Hello",
      description: "Body text",
      footer: "Tap one",
      buttons: [
        { title: "Yes", displayText: "Yes", id: "yes" },
        { title: "No", displayText: "No", id: "no" },
      ],
    });
    vi.unstubAllGlobals();
  });

  it("falls back to plain text when Evolution rejects buttons", async () => {
    const calls: Array<{ url: string; body: any }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, body: JSON.parse(String(init.body)) });
        if (url.includes("/message/sendButtons/")) {
          return new Response(JSON.stringify({ error: "unsupported" }), {
            status: 400,
          });
        }
        return new Response(
          JSON.stringify({ key: { id: "text-fallback" } }),
          { status: 201 },
        );
      }),
    );

    const result = await sendInteractiveButtons({
      ...BASE_ARGS,
      buttons: [{ id: "ok", title: "OK" }],
    });

    expect(result).toEqual({ messageId: "text-fallback" });
    expect(calls[1].url).toContain("/message/sendText/test-phone");
    expect(calls[1].body.text).toContain('responda com "ok"');
    vi.unstubAllGlobals();
  });
});

describe("sendInteractiveList - Evolution API payload", () => {
  it("sends the documented Evolution list payload", async () => {
    let captured: { url: string; body: unknown } | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        captured = { url, body: JSON.parse(String(init.body)) };
        return new Response(
          JSON.stringify({ key: { id: "evo-list-789" } }),
          { status: 201 },
        );
      }),
    );

    const result = await sendInteractiveList({
      ...BASE_ARGS,
      buttonLabel: "Open menu",
      sections: [
        {
          title: "Orders",
          rows: [
            { id: "order_1", title: "Order #1", description: "EUR 12" },
            { id: "order_2", title: "Order #2" },
          ],
        },
      ],
    });

    expect(result).toEqual({ messageId: "evo-list-789" });
    expect(captured).not.toBeNull();
    expect(captured!.url).toContain("/message/sendList/test-phone");
    expect(captured!.body).toMatchObject({
      number: "1234567890@s.whatsapp.net",
      title: "",
      description: "Body text",
      buttonText: "Open menu",
      footerText: " ",
      values: [
        {
          title: "Orders",
          rows: [
            { rowId: "order_1", title: "Order #1", description: "EUR 12" },
            { rowId: "order_2", title: "Order #2" },
          ],
        },
      ],
    });
    vi.unstubAllGlobals();
  });

  it("falls back to plain text when Evolution rejects lists", async () => {
    const calls: Array<{ url: string; body: any }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, body: JSON.parse(String(init.body)) });
        if (url.includes("/message/sendList/")) {
          return new Response(JSON.stringify({ error: "unsupported" }), {
            status: 400,
          });
        }
        return new Response(
          JSON.stringify({ key: { id: "list-fallback" } }),
          { status: 201 },
        );
      }),
    );

    const result = await sendInteractiveList({
      ...BASE_ARGS,
      buttonLabel: "Pick",
      sections: [{ rows: [{ id: "a", title: "Alpha" }] }],
    });

    expect(result).toEqual({ messageId: "list-fallback" });
    expect(calls[1].url).toContain("/message/sendText/test-phone");
    expect(calls[1].body.text).toContain('responda com "a"');
    vi.unstubAllGlobals();
  });
});
