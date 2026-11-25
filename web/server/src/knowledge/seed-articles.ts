import type { KnowledgeArticle } from "./retrieve.js";

type ArticleSeed = Omit<KnowledgeArticle, "tenantId">;

const ARTICLE_SEEDS: ArticleSeed[] = [
  {
    id: "delayed-festive-delivery",
    title: "Delayed festive delivery",
    category: "general",
    tags: ["delay", "late", "delivery", "deri", "der", "nahi aaya", "abhi tak", "pahuncha nahi", "time", "order"],
    body: "If a festive order is delayed or has not arrived yet, check its latest courier scan and promised delivery window. Apologize and share the confirmed update; escalate when tracking has not moved for 24 hours.",
  },
  {
    id: "missing-item",
    title: "An item is missing from the order",
    category: "sweets",
    tags: ["missing", "item", "package", "kam", "nahi mila", "gayab", "chhuta"],
    body: "Ask the customer which item is missing and verify the packed order. Arrange a replacement or refund for the missing item after the packing record is checked.",
  },
  {
    id: "damaged-in-transit",
    title: "Product damaged in transit",
    category: "decor",
    tags: ["damaged", "broken", "transit", "toota", "tuta hua", "kharab", "damage"],
    body: "For an item damaged during shipping, apologize and request a photo of the product and packaging. Offer a replacement or refund according to the item and delivery timeline.",
  },
  {
    id: "wrong-apparel-size",
    title: "Wrong apparel size received",
    category: "apparel",
    tags: ["wrong size", "apparel", "fit", "size galat", "chhota", "bada", "kapde"],
    body: "Confirm the size ordered and the size on the label. Unworn apparel can be exchanged for an available size within the return window.",
  },
  {
    id: "refund-timeline",
    title: "Refund processing timelines",
    category: "general",
    tags: ["refund", "money back", "timeline", "paisa wapas", "kab milega", "intezar"],
    body: "After a refund is approved, allow five to seven business days for the payment provider to return the money. Share the refund reference if the amount has not arrived after that period.",
  },
  {
    id: "replacement-policy",
    title: "Replacement eligibility and process",
    category: "general",
    tags: ["replacement", "replace", "exchange", "badalna", "naya bhejo", "dobara"],
    body: "A replacement may be arranged for an incorrect, missing, or damaged item after verification. Confirm stock and the delivery address before creating a replacement shipment.",
  },
  {
    id: "festive-delivery-windows",
    title: "Festive delivery windows",
    category: "gifting",
    tags: ["festive", "delivery window", "festival", "tyohar", "kab tak", "deri"],
    body: "Festive delivery estimates depend on the destination and courier capacity. The order confirmation contains the promised window; check tracking for the latest estimate before giving a new date.",
  },
  {
    id: "cod-refunds",
    title: "Refunds for cash on delivery orders",
    category: "general",
    tags: ["cash on delivery", "cod", "refund", "cash", "paise", "wapas"],
    body: "Cash-on-delivery refunds are issued by bank transfer or store credit after the return is approved. Collect verified payment details through the secure account flow, never in a public message.",
  },
  {
    id: "gift-packaging",
    title: "Gift packaging and festive notes",
    category: "gifting",
    tags: ["gift packaging", "gift wrap", "note", "tohfa", "packing", "sajawat"],
    body: "Gift orders can include festive packaging and a short message when selected at checkout. Packaging availability is shown for each eligible product.",
  },
  {
    id: "bulk-orders",
    title: "Placing and tracking bulk orders",
    category: "general",
    tags: ["bulk", "large order", "quantity", "zyada", "bahut saare", "bulk booking"],
    body: "For a large or corporate order, confirm quantities, destination, and required delivery date with the bulk-orders team. Large shipments may arrive in multiple parcels.",
  },
  {
    id: "sweets-freshness",
    title: "Freshness and storage for sweets",
    category: "sweets",
    tags: ["freshness", "storage", "sweets", "mithai", "taaza", "kharab"],
    body: "Store sweets as directed on the package and observe the best-before date. Contact support with the batch label if a sealed product arrives stale or spoiled.",
  },
  {
    id: "sweets-allergens",
    title: "Allergen information for sweets",
    category: "sweets",
    tags: ["allergen", "ingredients", "nuts", "allergy", "meva", "nuksan"],
    body: "Review the ingredients and allergen statement on each product page and package. Do not consume a product if its allergen information is unclear; contact support for confirmation.",
  },
  {
    id: "sweets-box-damage",
    title: "Damaged sweets box on arrival",
    category: "sweets",
    tags: ["sweets", "box", "damaged", "dabba toota", "mithai kharab", "bikhar gaya"],
    body: "If a sweets box arrives crushed or the contents are spoiled, keep the packaging and take clear photos. Support will review the shipment and arrange an eligible replacement or refund.",
  },
  {
    id: "apparel-exchange-window",
    title: "Apparel exchange window",
    category: "apparel",
    tags: ["exchange", "return window", "clothing", "kapde", "badalna", "kitne din"],
    body: "Eligible unworn clothing with original tags can be exchanged within the return window shown on the order. Start an exchange from the order page to see available pickup options.",
  },
  {
    id: "apparel-care",
    title: "Care instructions for apparel",
    category: "apparel",
    tags: ["wash", "care", "fabric", "dhona", "kapda", "rang"],
    body: "Follow the garment label for washing and ironing instructions. If color bleeding or a defect occurs on the first wash, stop using the item and contact support with photos.",
  },
  {
    id: "apparel-defect",
    title: "Defective apparel received",
    category: "apparel",
    tags: ["defect", "stitching", "damaged", "silai kharab", "phata", "kapde mein dikkat"],
    body: "For a manufacturing defect, share photos of the issue and garment label. Support will verify the claim and explain replacement or refund options.",
  },
  {
    id: "decor-installation",
    title: "Decor item setup and installation",
    category: "decor",
    tags: ["setup", "installation", "decor", "lagana", "sajawat", "kaise jode"],
    body: "Use the included setup guide for decor products. Contact support if a part is missing or the instructions do not match the item received.",
  },
  {
    id: "decor-color-variation",
    title: "Decor product color variation",
    category: "decor",
    tags: ["color", "variation", "decor", "rang alag", "tasveer jaisa nahi", "shade"],
    body: "Product colors can appear slightly different under different screens and lighting. If the delivered shade is materially different from the listing, share a photo for review.",
  },
  {
    id: "decor-fragile-shipping",
    title: "Shipping fragile decor safely",
    category: "decor",
    tags: ["fragile", "shipping", "packing", "nazuk", "toot sakta", "sambhal kar"],
    body: "Fragile decor is packed with protective material and marked for careful handling. Report breakage promptly with photos of the item and outer package.",
  },
  {
    id: "gifting-address-change",
    title: "Change the address for a gift order",
    category: "gifting",
    tags: ["gift address", "change address", "delivery address", "pata badlo", "kahan bheje", "tohfa"],
    body: "A gift delivery address can be changed before the order is handed to the courier. Verify the recipient details and check the shipment status before promising an update.",
  },
];

export function seedArticles(tenantId: string): KnowledgeArticle[] {
  return ARTICLE_SEEDS.map((article) => ({ ...article, tenantId }));
}
