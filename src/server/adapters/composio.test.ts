import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  link: vi.fn(),
  delete: vi.fn(),
  proxyExecute: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@composio/core", () => ({
  Composio: class {
    connectedAccounts = {
      list: mocks.list,
      link: mocks.link,
      delete: mocks.delete,
    };
    tools = { proxyExecute: mocks.proxyExecute };
  },
}));

import {
  getConnectedEmail,
  retrieveCaseEvidence,
} from "@/server/adapters/composio";

describe("Composio adapter contract", () => {
  beforeEach(() => {
    process.env.COMPOSIO_API_KEY = "composio-test-key";
    mocks.list.mockReset();
    mocks.proxyExecute.mockReset();
  });

  afterEach(() => {
    delete process.env.COMPOSIO_API_KEY;
  });

  it("lists only the authenticated app user's Gmail accounts", async () => {
    mocks.list.mockResolvedValue({
      items: [{ id: "ca_user_gmail", status: "ACTIVE" }],
    });

    await expect(getConnectedEmail("usr_alice")).resolves.toEqual({
      id: "ca_user_gmail",
      status: "connected",
      label: "Connected Gmail account",
    });
    expect(mocks.list).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: ["usr_alice"],
        toolkitSlugs: ["gmail"],
        statuses: ["ACTIVE", "EXPIRED"],
      })
    );
  });

  it("uses a pinned connected account and retains only normalized evidence", async () => {
    mocks.proxyExecute
      .mockResolvedValueOnce({
        data: { messages: [{ id: "msg_1", threadId: "thread_1" }] },
      })
      .mockResolvedValueOnce({
        data: {
          id: "msg_1",
          threadId: "thread_1",
          snippet: "Asiana itinerary for flight OZ212 on 2026-07-20.",
          internalDate: String(Date.UTC(2026, 6, 1)),
          payload: {
            headers: [{ name: "Subject", value: "Your Asiana itinerary" }],
            parts: [
              {
                filename: "baggage-receipt.pdf",
                mimeType: "application/pdf",
                body: { attachmentId: "att_1", size: 2048 },
              },
            ],
          },
        },
      });

    const evidence = await retrieveCaseEvidence({
      userId: "usr_alice",
      connectedAccountId: "ca_user_gmail",
      company: "Asiana Airlines",
    });

    expect(evidence).toHaveLength(2);
    expect(evidence[0].providerRefs).toEqual({
      connectedAccountId: "ca_user_gmail",
      messageId: "msg_1",
      threadId: "thread_1",
    });
    expect(evidence[1].providerRefs?.attachmentId).toBe("att_1");
    expect(mocks.proxyExecute).toHaveBeenCalledWith(
      expect.objectContaining({ connectedAccountId: "ca_user_gmail" })
    );
  });
});
