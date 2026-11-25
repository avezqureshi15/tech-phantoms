import { useEffect, useState } from "react";
import { BookOpen, Plus } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface Article {
  id: string;
  title: string;
  category: string;
  tags: string[];
  body: string;
  citedCount: number;
  updatedAt: string;
}

const fieldClass =
  "w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-brand-lighter focus-visible:ring-4 focus-visible:ring-brand/10";

export default function Knowledge() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("general");
  const [tags, setTags] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function loadArticles() {
    const data = await apiFetch<{ articles: Article[] }>("/api/knowledge");
    setArticles(data.articles);
  }

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ articles: Article[] }>("/api/knowledge")
      .then(({ articles: loaded }) => {
        if (!cancelled) {
          setArticles(loaded);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load knowledge articles");
      });
    return () => { cancelled = true; };
  }, []);

  async function createArticle(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/knowledge", {
        method: "POST",
        body: JSON.stringify({
          title,
          category,
          tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
          body,
        }),
      });
      setTitle("");
      setTags("");
      setBody("");
      await loadArticles();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Article was not saved");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="min-w-0">
        <header className="mb-4">
          <h1 className="font-heading text-3xl font-medium tracking-tight text-ink">
            Knowledge <span className="text-primary">base</span>
          </h1>
          <p className="mt-1.5 text-sm text-tertiary">Articles the agent can retrieve during customer calls.</p>
        </header>
        {error && <p role="alert" className="mb-4 rounded-xl border border-status-danger/25 bg-status-danger-bg px-3.5 py-2.5 text-sm text-status-danger">{error}</p>}
        <div className="flex flex-col gap-3">
          {articles.map((article) => (
            <article key={article.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-heading text-base font-medium tracking-tight text-ink">{article.title}</h2>
                  <p className="mt-1 text-sm text-tertiary"><span className="capitalize">{article.category}</span> · cited in {article.citedCount} calls</p>
                </div>
                <time className="rounded-full bg-mint px-2.5 py-1 text-xs text-primary">Updated {new Date(article.updatedAt).toLocaleDateString()}</time>
              </div>
              <p className="mt-3 text-sm leading-6 text-tertiary">{article.body}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">{article.tags.map((tag) => <span key={`${article.id}:${tag}`} className="rounded-full border border-border bg-brand-light/60 px-2.5 py-0.5 text-xs text-tertiary">{tag}</span>)}</div>
            </article>
          ))}
          {articles.length === 0 && <div className="rounded-2xl border border-border bg-card px-4 py-10 text-center shadow-sm"><BookOpen className="mx-auto size-5 text-primary" /><p className="mt-2 text-sm text-tertiary">No articles yet. Add one on the right.</p></div>}
        </div>
      </section>

      <aside className="h-fit rounded-2xl border border-border bg-card p-5 shadow-sm xl:sticky xl:top-5">
        <h2 className="flex items-center gap-2 font-heading text-base font-medium tracking-tight text-ink"><span className="flex size-7 items-center justify-center rounded-lg bg-mint text-primary"><Plus className="size-4" /></span>New article</h2>
        <form onSubmit={createArticle} className="mt-4 flex flex-col gap-3">
          <div><label htmlFor="article-title" className="mb-1.5 block text-xs font-medium text-tertiary">Title</label><input id="article-title" required minLength={3} maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} className={fieldClass} /></div>
          <div><label htmlFor="article-category" className="mb-1.5 block text-xs font-medium text-tertiary">Category</label><select id="article-category" value={category} onChange={(event) => setCategory(event.target.value)} className={fieldClass}><option value="general">General</option><option value="sweets">Sweets</option><option value="apparel">Apparel</option><option value="decor">Decor</option><option value="gifting">Gifting</option></select></div>
          <div><label htmlFor="article-tags" className="mb-1.5 block text-xs font-medium text-tertiary">Tags, comma-separated</label><input id="article-tags" required value={tags} onChange={(event) => setTags(event.target.value)} placeholder="delay, late, deri, nahi aaya" className={fieldClass} /><p className="mt-1.5 text-xs leading-5 text-tertiary">Hard requirement: every article needs Hinglish search terms alongside English tags. Include phrases customers use, such as “deri”, “nahi aaya”, “abhi tak”, and “pahuncha nahi”.</p></div>
          <div><label htmlFor="article-body" className="mb-1.5 block text-xs font-medium text-tertiary">Article content</label><textarea id="article-body" required minLength={10} maxLength={20000} rows={7} value={body} onChange={(event) => setBody(event.target.value)} className={`${fieldClass} leading-6`} /></div>
          <button type="submit" disabled={saving} className="mt-1 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-brand-dark disabled:opacity-50">{saving ? "Saving…" : "Save article"}</button>
        </form>
      </aside>
    </div>
  );
}
