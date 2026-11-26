import { NextResponse } from "next/server";
import db from "@/db/knex";
import {
  getBroadcastHistory,
  sendBroadcastMessage,
} from "@/actions/messages";
import { runWithIdempotency } from "@/lib/sync-bus";
import {
  extractClientMutationId,
  HttpStatusError,
  sanitizeServerMessage,
  withMobileAuth,
} from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withMobileAuth(req, async ({ tenantId }) => {
    const res = await getBroadcastHistory();
    if (!res.success || !res.data) {
      return NextResponse.json(
        {
          error: sanitizeServerMessage(
            res.message,
            "Unable to load broadcast messages right now.",
          ),
        },
        { status: 400 },
      );
    }

    const mapped = res.data.map((m: any) => ({
      id: String(m.id),
      senderId: String(m.sender_id),
      senderName: String(m.sender_name || "Admin"),
      recipientGroup: m.recipient_group,
      channel: m.channel,
      subject: m.subject ?? null,
      content: String(m.content || ""),
      recipientCount: Number(m.recipient_count ?? 0),
      status: m.status || "sent",
      createdAt: String(m.created_at || new Date().toISOString()),
    }));

    void tenantId;
    return NextResponse.json(mapped);
  });
}

export async function POST(req: Request) {
  return withMobileAuth(
    req,
    async ({ tenantId, clientMutationId }) => {
      const body = await req.json().catch(() => ({}));
      const mutationId = extractClientMutationId(req, body) || clientMutationId;

      const result = await runWithIdempotency({
        tenantId,
        clientMutationId: mutationId,
        endpoint: "POST:/api/mobile/v1/messages",
        handler: async () => {
          const res = await sendBroadcastMessage({
            recipientGroup: body.recipientGroup,
            channel: body.channel,
            subject: body.subject,
            content: body.content,
            recipientIds: body.recipientIds,
          });

          if (!res.success || !res.data) {
            throw new HttpStatusError(
              sanitizeServerMessage(
                res.message,
                "Unable to send broadcast message right now.",
              ),
              400,
            );
          }

          const created = await db("broadcast_messages")
            .where({ id: res.data.id, tenant_id: tenantId })
            .first();

          return {
            statusCode: 201,
            body: {
              id: String(created?.id || res.data.id),
              senderId: String(created?.sender_id || ""),
              senderName: String(created?.sender_name || "Admin"),
              recipientGroup: created?.recipient_group || body.recipientGroup,
              channel: created?.channel || body.channel,
              subject: created?.subject ?? body.subject ?? null,
              content: String(created?.content || body.content),
              recipientCount: Number(
                created?.recipient_count ?? res.data.recipientCount,
              ),
              status: created?.status || res.data.status,
              createdAt: String(created?.created_at || new Date().toISOString()),
            },
          };
        },
      });

      return NextResponse.json(result.body, { status: result.statusCode });
    },
    { requireAdmin: true },
  );
}
