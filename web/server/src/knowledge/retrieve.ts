export interface KnowledgeArticle {
  id: string;
  tenantId: string;
  title: string;
  category: string;
  tags: string[];
  body: string;
}

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "was",
  "with",
  "hai",
  "hain",
  "ho",
  "hota",
  "hoti",
  "ka",
  "ke",
  "ki",
  "ko",
  "kya",
  "mein",
  "mera",
  "meri",
  "mere",
  "nahi",
  "nahin",
  "aur",
  "se",
]);

function tokenize(text: string): string[] {
  return text.toLocaleLowerCase("en-IN").match(/[\p{L}\p{N}]+/gu) ?? [];
}

function scoreArticle(article: KnowledgeArticle, queryTerms: Set<string>): number {
  const titleTerms = new Set(tokenize(article.title));
  const tagTerms = new Set(article.tags.flatMap(tokenize));
  const bodyTerms = new Set(tokenize(article.body));

  let score = 0;
  for (const term of queryTerms) {
    if (titleTerms.has(term)) score += 3;
    if (tagTerms.has(term)) score += 2;
    if (bodyTerms.has(term)) score += 1;
  }
  return score;
}

export function retrieve(
  articles: readonly KnowledgeArticle[],
  tenantId: string,
  category: string,
  queryText: string,
  limit = 3,
): KnowledgeArticle[] {
  const queryTerms = new Set(tokenize(queryText).filter((term) => !STOPWORDS.has(term)));
  if (queryTerms.size === 0 || !Number.isFinite(limit) || limit <= 0) return [];

  return articles
    .filter(
      (article) =>
        article.tenantId === tenantId &&
        (article.category === category || article.category === "general"),
    )
    .map((article) => ({ article, score: scoreArticle(article, queryTerms) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.floor(limit))
    .map(({ article }) => article);
}
