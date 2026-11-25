import { Router, type Request } from "express";
import { prisma } from "../db/prisma";
import { recordAudit } from "../auth/audit";

export const knowledgeRouter = Router();

const HINGLISH_TERMS = new Set([
  "deri", "der", "nahi", "nahin", "aaya", "aayi", "abhi", "tak", "pahuncha", "pahucha", "mila", "kam", "toota", "tuta", "kharab", "galat", "kapde", "badalna", "wapas", "paisa", "kitne", "kab", "tohfa", "mithai", "zyada", "naya", "bahut",
]);

function tenantId(req: Request): string {
  return req.auth!.tenant!.id;
}

function parseArticle(body: unknown): { title: string; category: string; tags: string[]; content: string } | null {
  if (typeof body !== "object" || body === null) return null;
  const input = body as Record<string, unknown>;
  if (
    typeof input.title !== "string" || input.title.trim().length < 3 || input.title.length > 160 ||
    typeof input.category !== "string" || input.category.trim().length === 0 || input.category.length > 80 ||
    !Array.isArray(input.tags) || input.tags.length === 0 || input.tags.some((tag) => typeof tag !== "string" || tag.length > 80) ||
    typeof input.body !== "string" || input.body.trim().length < 10 || input.body.length > 20_000
  ) return null;

  const tags = input.tags.map((tag: string) => tag.trim().toLowerCase()).filter(Boolean);
  const hasHinglishTag = tags.some((tag) => tag.split(/[^\p{L}\p{N}]+/u).some((term) => HINGLISH_TERMS.has(term)));
  if (!hasHinglishTag) return null;
  return { title: input.title.trim(), category: input.category.trim().toLowerCase(), tags, content: input.body.trim() };
}

knowledgeRouter.get("/", async (req, res) => {
  const articles = await prisma.knowledgeArticle.findMany({
    where: { tenantId: tenantId(req) },
    orderBy: [{ category: "asc" }, { title: "asc" }],
  });
  res.json({ articles, tagHelp: "Include Hinglish search terms such as deri, nahi aaya, abhi tak or pahuncha nahi alongside English tags." });
});

knowledgeRouter.post("/", async (req, res) => {
  const article = parseArticle(req.body);
  if (!article) {
    res.status(400).json({ error: "valid title, category, tags with at least one Hinglish keyword, and body are required" });
    return;
  }
  const { content, ...data } = article;
  const created = await prisma.knowledgeArticle.create({
    data: { ...data, body: content, tenantId: tenantId(req) },
  });
  await recordAudit({
    actorUserId: req.auth!.user.id,
    tenantId: tenantId(req),
    action: "knowledge.create",
    targetType: "KnowledgeArticle",
    targetId: created.id,
    ip: req.ip,
  });
  res.status(201).json({ article: created });
});

knowledgeRouter.patch("/:id", async (req, res) => {
  const article = parseArticle(req.body);
  if (!article) {
    res.status(400).json({ error: "valid title, category, tags with at least one Hinglish keyword, and body are required" });
    return;
  }
  const tenant = tenantId(req);
  const result = await prisma.knowledgeArticle.updateMany({
    where: { id: req.params.id, tenantId: tenant },
    data: { title: article.title, category: article.category, tags: article.tags, body: article.content },
  });
  if (result.count !== 1) {
    res.status(404).json({ error: "article not found" });
    return;
  }
  const updated = await prisma.knowledgeArticle.findFirst({ where: { id: req.params.id, tenantId: tenant } });
  await recordAudit({
    actorUserId: req.auth!.user.id,
    tenantId: tenant,
    action: "knowledge.update",
    targetType: "KnowledgeArticle",
    targetId: req.params.id,
    ip: req.ip,
  });
  res.json({ article: updated });
});

knowledgeRouter.delete("/:id", async (req, res) => {
  const tenant = tenantId(req);
  const deleted = await prisma.knowledgeArticle.deleteMany({ where: { id: req.params.id, tenantId: tenant } });
  if (deleted.count !== 1) {
    res.status(404).json({ error: "article not found" });
    return;
  }
  await recordAudit({
    actorUserId: req.auth!.user.id,
    tenantId: tenant,
    action: "knowledge.delete",
    targetType: "KnowledgeArticle",
    targetId: req.params.id,
    ip: req.ip,
  });
  res.sendStatus(204);
});
