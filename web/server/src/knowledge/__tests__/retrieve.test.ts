import { describe, expect, it } from "vitest";
import { retrieve, type KnowledgeArticle } from "../retrieve.js";
import { seedArticles } from "../seed-articles.js";

const TENANT_ID = "tenant-one";

function article(overrides: Partial<KnowledgeArticle> & Pick<KnowledgeArticle, "id">): KnowledgeArticle {
  return {
    tenantId: TENANT_ID,
    title: "",
    category: "sweets",
    tags: [],
    body: "",
    ...overrides,
  };
}

describe("retrieve", () => {
  it("finds delayed delivery material for a Hinglish order-status query", () => {
    const results = retrieve(
      seedArticles(TENANT_ID),
      TENANT_ID,
      "gifting",
      "mera order abhi tak nahi aaya",
    );

    expect(results[0]?.id).toBe("delayed-festive-delivery");
    expect(retrieve(seedArticles(TENANT_ID), TENANT_ID, "sweets", "mera order abhi tak nahi aaya")[0]?.id)
      .toBe("delayed-festive-delivery");
  });

  it("strips English and Hindi stopwords without losing meaningful query terms", () => {
    const articles = [
      article({ id: "delivery", title: "Delivery update", body: "Your order is on its way." }),
    ];

    expect(retrieve(articles, TENANT_ID, "sweets", "mera order nahi aaya")).toHaveLength(1);
    expect(retrieve(articles, TENANT_ID, "sweets", "hai nahi mera kya aur ka ki ko se mein")).toEqual([]);
  });

  it("weights title above tags and tags above body, then returns only positive top-N matches", () => {
    const articles = [
      article({ id: "body", body: "delivery" }),
      article({ id: "tags", tags: ["delivery"] }),
      article({ id: "title", title: "Delivery" }),
      article({ id: "unmatched", title: "Refund" }),
    ];

    expect(retrieve(articles, TENANT_ID, "sweets", "delivery", 2).map(({ id }) => id)).toEqual([
      "title",
      "tags",
    ]);
  });

  it("isolates tenants and includes only the requested category plus general articles", () => {
    const articles = [
      article({ id: "matching-tenant-category", title: "Delivery delay", category: "sweets" }),
      article({ id: "matching-tenant-general", title: "Delivery help", category: "general" }),
      article({ id: "wrong-category", title: "Delivery delay", category: "apparel" }),
      article({ id: "wrong-tenant", tenantId: "tenant-two", title: "Delivery delay", category: "sweets" }),
    ];

    expect(retrieve(articles, TENANT_ID, "sweets", "delivery").map(({ id }) => id)).toEqual([
      "matching-tenant-category",
      "matching-tenant-general",
    ]);
  });
});
