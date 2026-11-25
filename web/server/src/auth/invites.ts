import type { Invitation, PlatformRole, TenantRole } from "../generated/prisma";
import { prismaUnscoped } from "../db/prisma";
import { generateToken, hashToken } from "./tokens";

export interface InviteDelivery {
  readonly name: "console" | "email";
  send(invite: { email: string; link: string; tenantName: string; role: string }): Promise<void>;
}

/**
 * Hackathon-safe delivery: the admin copies the link. The seam exists so a
 * Resend/SES implementation can drop in without changing callers.
 */
class ConsoleInviteDelivery implements InviteDelivery {
  readonly name = "console" as const;

  async send(invite: { email: string; link: string; tenantName: string; role: string }): Promise<void> {
    console.log("Invitation link ready", {
      email: invite.email,
      tenantName: invite.tenantName,
      role: invite.role,
    });
  }
}

export const inviteDelivery: InviteDelivery = new ConsoleInviteDelivery();

function inviteTtlHours(): number {
  const value = Number(process.env.INVITE_TTL_HOURS ?? 168);
  return Number.isFinite(value) && value > 0 ? Math.min(value, 24 * 30) : 168;
}

export function inviteLink(token: string): string {
  const origin = process.env.CLIENT_ORIGIN ?? "http://localhost:5174";
  return `${origin}/accept-invite/${token}`;
}

export interface CreatedInvitation {
  invitation: Invitation;
  token: string;
  link: string;
}

export async function createInvitation(input: {
  email: string;
  tenantId: string | null;
  role: TenantRole | null;
  platformRole: PlatformRole | null;
  invitedById: string;
}): Promise<CreatedInvitation> {
  const token = generateToken();
  const invitation = await prismaUnscoped.invitation.create({
    data: {
      email: input.email.toLowerCase(),
      tenantId: input.tenantId,
      role: input.role,
      platformRole: input.platformRole,
      tokenHash: hashToken(token),
      invitedById: input.invitedById,
      expiresAt: new Date(Date.now() + inviteTtlHours() * 60 * 60 * 1000),
    },
  });
  return { invitation, token, link: inviteLink(token) };
}

export async function deliverInvitation(input: {
  email: string;
  link: string;
  tenantName: string;
  role: string;
}): Promise<void> {
  await inviteDelivery.send(input);
}
