import { Router } from "express";
import type { EnquiryStatus } from "../generated/prisma";
import { prisma } from "../db/prisma";

export const enquiriesRouter = Router();
const ENQUIRY_STATUSES: EnquiryStatus[] = ["NEW", "REVIEWED", "CLOSED"];

enquiriesRouter.get("/", async (req, res) => {
  const tenantId = req.auth!.tenant!.id;
  const status = typeof req.query.status === "string" && ENQUIRY_STATUSES.includes(req.query.status as EnquiryStatus)
    ? req.query.status as EnquiryStatus
    : undefined;
  const requestedLimit = Number(req.query.limit);
  const take = Number.isInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, 200)
    : 200;
  const enquiries = await prisma.enquiry.findMany({
    where: { tenantId, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    take,
  });
  res.json({ enquiries });
});

enquiriesRouter.patch("/:id", async (req, res) => {
  const tenantId = req.auth!.tenant!.id;
  const status = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>).status : undefined;
  if (typeof status !== "string" || !ENQUIRY_STATUSES.includes(status as EnquiryStatus)) {
    res.status(400).json({ error: "Status must be NEW, REVIEWED, or CLOSED" });
    return;
  }

  const result = await prisma.enquiry.updateMany({
    where: { id: req.params.id, tenantId },
    data: { status: status as EnquiryStatus },
  });
  if (result.count !== 1) {
    res.status(404).json({ error: "Enquiry not found" });
    return;
  }
  const enquiry = await prisma.enquiry.findFirst({ where: { id: req.params.id, tenantId } });
  res.json({ enquiry });
});
