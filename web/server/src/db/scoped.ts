import { prisma } from "./prisma";
import type { Prisma } from "../generated/prisma";

/**
 * Tenant-scoped accessors used by the legacy ticket, commerce and agent paths.
 * New call/query/knowledge paths currently use Prisma directly and MUST include
 * tenantId in every read, write and update predicate; this module does not wrap
 * those new models yet.
 */
export function scoped(tenantId: string) {
  return {
    customer: {
      findMany: (args?: Omit<Prisma.CustomerFindManyArgs, "where"> & { where?: Omit<Prisma.CustomerWhereInput, "tenantId"> }) =>
        prisma.customer.findMany({ ...args, where: { ...args?.where, tenantId } }),
      findUnique: (id: string) =>
        prisma.customer.findFirst({ where: { id, tenantId } }),
      create: (data: Omit<Prisma.CustomerUncheckedCreateInput, "tenantId">) =>
        prisma.customer.create({ data: { ...data, tenantId } }),
    },
    order: {
      findMany: (args?: Omit<Prisma.OrderFindManyArgs, "where"> & { where?: Omit<Prisma.OrderWhereInput, "tenantId"> }) =>
        prisma.order.findMany({ ...args, where: { ...args?.where, tenantId } }),
      findUnique: (id: string) =>
        prisma.order.findFirst({ where: { id, tenantId } }),
      update: (id: string, data: Prisma.OrderUpdateInput) =>
        prisma.order.update({ where: { id, tenantId }, data }),
    },
    ticket: {
      findMany: (args?: Omit<Prisma.TicketFindManyArgs, "where"> & { where?: Omit<Prisma.TicketWhereInput, "tenantId"> }) =>
        prisma.ticket.findMany({ ...args, where: { ...args?.where, tenantId } }),
      findUnique: (id: string, args?: Pick<Prisma.TicketFindFirstArgs, "include">) =>
        prisma.ticket.findFirst({ ...args, where: { id, tenantId } }),
      create: (data: Omit<Prisma.TicketUncheckedCreateInput, "tenantId">) =>
        prisma.ticket.create({ data: { ...data, tenantId } }),
      update: (id: string, data: Prisma.TicketUpdateInput) =>
        prisma.ticket.update({ where: { id, tenantId }, data }),
    },
    message: {
      findMany: (ticketId: string) =>
        prisma.message.findMany({ where: { ticketId, tenantId }, orderBy: { createdAt: "asc" } }),
      create: (data: Omit<Prisma.MessageUncheckedCreateInput, "tenantId">) =>
        prisma.message.create({ data: { ...data, tenantId } }),
    },
    agentAction: {
      findMany: (ticketId: string) =>
        prisma.agentAction.findMany({ where: { ticketId, tenantId }, orderBy: { createdAt: "asc" } }),
      create: (data: Omit<Prisma.AgentActionUncheckedCreateInput, "tenantId">) =>
        prisma.agentAction.create({ data: { ...data, tenantId } }),
    },
    approval: {
      findMany: (args?: Omit<Prisma.ApprovalFindManyArgs, "where"> & { where?: Omit<Prisma.ApprovalWhereInput, "tenantId"> }) =>
        prisma.approval.findMany({ ...args, where: { ...args?.where, tenantId } }),
      findUnique: (id: string) =>
        prisma.approval.findFirst({ where: { id, tenantId } }),
      create: (data: Omit<Prisma.ApprovalUncheckedCreateInput, "tenantId">) =>
        prisma.approval.create({ data: { ...data, tenantId } }),
      update: (id: string, data: Prisma.ApprovalUpdateInput) =>
        prisma.approval.update({ where: { id, tenantId }, data }),
    },
  };
}

export async function tenantBySlug(slug: string) {
  return prisma.tenant.findUnique({ where: { slug } });
}
