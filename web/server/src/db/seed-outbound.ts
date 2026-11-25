import { prismaUnscoped } from "./prisma";
import { seedArticles } from "../knowledge/seed-articles";

function productCategory(name: string): string {
  const normalized = name.toLowerCase();
  if (/mithai|ladoo|jamun|rasgulla|sweet|namkeen|katli|kaju|barfi|burfi|peda|halwa|soan|papdi/.test(normalized)) return "sweets";
  if (/kurta|apparel|saree|shirt|size/.test(normalized)) return "apparel";
  if (/diya|light|rangoli|decor|stencil/.test(normalized)) return "decor";
  return "gifting";
}

export async function seedOutboundData(): Promise<{ products: number; queries: number; articles: number }> {
  const tenants = await prismaUnscoped.tenant.findMany({ include: { orders: { include: { customer: true } } } });
  let productCount = 0;
  let queryCount = 0;
  let articleCount = 0;

  for (const tenant of tenants) {
    const categoryProducts = new Map<string, string>();
    const articles = seedArticles(tenant.id);
    for (const article of articles) {
      const id = `${tenant.slug}-${article.id}`;
      await prismaUnscoped.knowledgeArticle.upsert({
        where: { id },
        create: { ...article, id },
        update: { title: article.title, category: article.category, tags: article.tags, body: article.body },
      });
      articleCount++;
    }

    for (const order of tenant.orders) {
      const firstItem = Array.isArray(order.items) && order.items[0] && typeof order.items[0] === "object"
        ? order.items[0] as { name?: unknown }
        : null;
      const productName = typeof firstItem?.name === "string" ? firstItem.name : "General order";
      const category = productCategory(productName);
      const productKey = `${category}:${productName}`;
      let productId = categoryProducts.get(productKey);
      if (!productId) {
        const product = await prismaUnscoped.product.upsert({
          where: { tenantId_name: { tenantId: tenant.id, name: productName } },
          create: { tenantId: tenant.id, name: productName, category },
          update: { category },
        });
        productId = product.id;
        categoryProducts.set(productKey, productId);
        productCount++;
      }

      const isProblem = order.status === "DELAYED" || (order.status === "DISPATCHED" && order.promisedAt < new Date());
      if (!isProblem) continue;
      const id = `outbound-${order.id}`;
      await prismaUnscoped.query.upsert({
        where: { id },
        create: {
          id,
          tenantId: tenant.id,
          customerId: order.customerId,
          orderId: order.id,
          productId,
          issueSummary: `Delivery for ${productName} is delayed beyond the promised window.`,
          category,
          priority: order.status === "DELAYED" ? "HIGH" : "NORMAL",
          status: "NEW",
        },
        update: { productId, issueSummary: `Delivery for ${productName} is delayed beyond the promised window.`, category },
      });
      queryCount++;
    }
  }

  return { products: productCount, queries: queryCount, articles: articleCount };
}
