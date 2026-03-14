import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useWizard } from "@/store/wizard";
import { useI18n, useT } from "@/i18n";
import { SkillsCard } from "@/components/SkillsCard";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { LocaleKeys } from "@/i18n";
import {
  ChevronLeft,
  Globe,
  Search,
  Loader2,
  RefreshCw,
  Download,
  Star,
  ArrowDownWideNarrow,
  Store,
  ExternalLink,
  User,
  Tag,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface MarketSkill {
  slug: string;
  name: string;
  description: string;
  version: string | null;
  homepage: string | null;
  tags: string[];
  downloads: number;
  stars: number;
  installs: number;
  updated_at: number | string | null;
  score: number | null;
  owner: string | null;
}

interface MarketCategory {
  name: string;
  name_zh: string;
  count: number;
  slugs: string[];
}

interface MarketData {
  total: number;
  featured: string[];              // slug list
  categories: MarketCategory[];
  skills: MarketSkill[];
}

type SortKey = "downloads" | "stars" | "recent";
type MarketTab = "market" | "myskills";

// ─── Page ───────────────────────────────────────────────────────────────────

export function SkillMarketPage() {
  const { setAppMode } = useWizard();
  const t = useT();
  const lang = useI18n((s) => s.lang);
  const toggleLang = useI18n((s) => s.toggleLang);

  const [tab, setTab] = useState<MarketTab>("market");
  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("downloads");
  const [installingSlug, setInstallingSlug] = useState<string | null>(null);
  const [installedSlugs, setInstalledSlugs] = useState<Set<string>>(new Set());
  const [failedSlugs, setFailedSlugs] = useState<Map<string, string>>(new Map());
  const [installLogs, setInstallLogs] = useState<string[]>([]);
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);

  const fetchMarket = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<MarketData>("fetch_skill_market");
      setData(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!data && !loading) fetchMarket();
    // Scan disk for already-installed skills
    invoke<string[]>("list_installed_skills").then((slugs) => {
      if (slugs.length > 0) setInstalledSlugs(new Set(slugs));
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Category keyword map for broad matching
  const categoryKeywords: Record<string, string[]> = useMemo(() => ({
    "AI Intelligence": ["ai", "intelligence", "machine-learning", "ml", "llm", "gpt", "nlp", "deep-learning", "model"],
    "Dev Tools": ["dev", "developer", "development", "coding", "code", "git", "debug", "build", "cli", "terminal", "sdk"],
    "Productivity": ["productivity", "efficiency", "automation", "workflow", "task", "schedule", "todo"],
    "Data Analytics": ["data", "analytics", "analysis", "database", "sql", "visualization", "chart", "report"],
    "Content Creation": ["content", "writing", "creative", "design", "media", "image", "video", "text", "blog", "markdown"],
    "Security": ["security", "compliance", "auth", "encryption", "privacy", "audit", "vulnerability"],
    "Communication": ["communication", "chat", "messaging", "collaboration", "team", "slack", "email", "notification"],
  }), []);

  // Filter + sort
  const filtered = useMemo(() => {
    if (!data) return [];
    let list = data.skills;

    if (activeCategory) {
      const cat = data.categories.find(
        (c) => c.name === activeCategory || c.name_zh === activeCategory
      );
      const curatedSlugs = cat ? new Set(cat.slugs) : new Set<string>();
      const keywords = categoryKeywords[activeCategory] || [];

      list = list.filter((s) => {
        if (curatedSlugs.has(s.slug)) return true;
        if (keywords.length === 0) return false;
        const haystack = `${s.name} ${s.description} ${s.tags.join(" ")}`.toLowerCase();
        return keywords.some((kw) => haystack.includes(kw));
      });
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.slug.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    }

    const sorted = [...list];
    switch (sort) {
      case "downloads":
        sorted.sort((a, b) => b.downloads - a.downloads);
        break;
      case "stars":
        sorted.sort((a, b) => b.stars - a.stars);
        break;
      case "recent":
        sorted.sort((a, b) =>
          (Number(b.updated_at) || 0) - (Number(a.updated_at) || 0)
        );
        break;
    }
    return sorted;
  }, [data, search, activeCategory, sort, categoryKeywords]);

  // Lazy load: render first N, load more on scroll
  const [visibleCount, setVisibleCount] = useState(50);
  useEffect(() => {
    setVisibleCount(50);
  }, [search, activeCategory, sort]);

  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
      setVisibleCount((v) => Math.min(v + 50, filtered.length));
    }
  }, [filtered.length]);

  const visible = filtered.slice(0, visibleCount);

  const handleInstall = async (slug: string) => {
    if (installingSlug) return;
    setInstallingSlug(slug);
    setInstallLogs([]);
    setFailedSlugs((prev) => { const m = new Map(prev); m.delete(slug); return m; });
    const unlisten = await listen<{ slug: string; text: string }>(
      "market_install_log",
      (e) => {
        if (e.payload.slug === slug) {
          setInstallLogs((prev) => [...prev, e.payload.text]);
        }
      }
    );
    try {
      await invoke("install_market_skill", { slug });
      setInstalledSlugs((prev) => new Set(prev).add(slug));
    } catch (err) {
      const msg = String(err).replace(/^Install failed:\s*/, "").slice(0, 120);
      setFailedSlugs((prev) => new Map(prev).set(slug, msg || "Unknown error"));
    } finally {
      unlisten();
      setInstallingSlug(null);
    }
  };

  const formatNum = (n: number) => {
    if (n >= 10000) return `${(n / 1000).toFixed(0)}k`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
  };

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: "downloads", label: t("market.sortDownloads") },
    { key: "stars", label: t("market.sortStars") },
    { key: "recent", label: t("market.sortRecent") },
  ];

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header — fixed */}
      <div className="shrink-0 flex items-center gap-2">
        <button
          onClick={() => setAppMode("home")}
          className="p-1.5 rounded-[7px] hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <Store className="w-5 h-5 text-[hsl(32,82%,52%)]" />
        <h2 className="text-[20px] font-semibold flex-1">{t("market.title")}</h2>
        <button
          onClick={toggleLang}
          className="flex items-center gap-1 text-[13px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
        >
          <Globe className="w-3.5 h-3.5" />
          {t("common.langLabel")}
        </button>
      </div>

      {/* Tab switcher — fixed */}
      <div className="shrink-0 flex gap-0.5 rounded-[9px] bg-[hsl(var(--muted))] p-[3px]">
        {(
          [
            { key: "market" as MarketTab, label: t("market.tabMarket") },
            { key: "myskills" as MarketTab, label: t("market.tabMySkills") },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "flex-1 text-[13px] py-[6px] rounded-[7px] transition-all font-medium",
              tab === key
                ? "bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm"
                : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Market tab — scrollable area */}
      {tab === "market" && (
        <div className="flex flex-col flex-1 min-h-0 gap-3">
          {/* Search + sort — fixed */}
          <div className="shrink-0 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
              <Input
                placeholder={t("market.search")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-[34px] pl-8 text-[14px] border-0 bg-[hsl(var(--card))] rounded-[8px] shadow-none"
              />
            </div>
            <div className="flex items-center gap-0.5">
              <ArrowDownWideNarrow className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))] mr-0.5" />
              {sortOptions.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setSort(opt.key)}
                  className={cn(
                    "text-[12px] px-2 py-1 rounded-[6px] transition-colors",
                    sort === opt.key
                      ? "bg-[hsl(var(--primary))]/12 text-[hsl(var(--primary))] font-medium"
                      : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Category pills — fixed */}
          {data && data.categories.length > 0 && (
            <div className="shrink-0 flex gap-1.5 flex-wrap">
              <button
                onClick={() => setActiveCategory(null)}
                className={cn(
                  "text-[12px] px-2.5 py-1 rounded-full transition-colors",
                  !activeCategory
                    ? "bg-[hsl(var(--primary))] text-white font-medium"
                    : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                )}
              >
                {t("market.all")}
              </button>
              {data.categories.map((cat) => {
                const keywords = categoryKeywords[cat.name] || [];
                const catCount = data.skills.filter((s) => {
                  if (cat.slugs.includes(s.slug)) return true;
                  if (keywords.length === 0) return false;
                  const h = `${s.name} ${s.description} ${s.tags.join(" ")}`.toLowerCase();
                  return keywords.some((kw) => h.includes(kw));
                }).length;
                return (
                  <button
                    key={cat.name}
                    onClick={() =>
                      setActiveCategory(
                        activeCategory === cat.name ? null : cat.name
                      )
                    }
                    className={cn(
                      "text-[12px] px-2.5 py-1 rounded-full transition-colors",
                      activeCategory === cat.name
                        ? "bg-[hsl(var(--primary))] text-white font-medium"
                        : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                    )}
                  >
                    {lang === "zh" ? cat.name_zh : cat.name}
                    <span className="ml-1 opacity-60">{catCount}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center gap-2 py-12">
              <Loader2 className="w-5 h-5 animate-spin text-[hsl(var(--muted-foreground))]" />
              <span className="text-[15px] text-[hsl(var(--muted-foreground))]">
                {t("market.loading")}
              </span>
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="flex flex-col items-center gap-3 py-12">
              <p className="text-[15px] text-[hsl(var(--destructive))]">
                {t("market.loadError")}
              </p>
              <p className="text-[13px] text-[hsl(var(--muted-foreground))] max-w-[300px] text-center">
                {error}
              </p>
              <button
                onClick={fetchMarket}
                className="flex items-center gap-1.5 text-[14px] text-[hsl(var(--primary))] hover:underline"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {t("market.retry")}
              </button>
            </div>
          )}

          {/* Count + refresh — fixed */}
          {!loading && data && (
            <div className="shrink-0 flex items-center justify-between px-1">
              <span className="text-[12px] text-[hsl(var(--muted-foreground))]">
                {t("market.total").replace("{count}", String(filtered.length))}
              </span>
              {data.total > 0 && (
                <button
                  onClick={fetchMarket}
                  className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                </button>
              )}
            </div>
          )}

          {!loading && data && filtered.length === 0 && (
            <div className="py-8 text-center text-[15px] text-[hsl(var(--muted-foreground))]">
              {t("market.noMatch")}
            </div>
          )}

          {/* ★ Scrollable skill list — uses relative+absolute to guarantee height constraint */}
          {!loading && data && filtered.length > 0 && (
            <div className="relative flex-1 min-h-0">
              <div
                ref={listRef}
                onScroll={handleScroll}
                className="absolute inset-0 overflow-y-auto bg-[hsl(var(--card))] rounded-[12px] divide-y divide-[hsl(var(--border))]"
              >
                {visible.map((skill) => (
                  <MarketSkillRow
                    key={skill.slug}
                    skill={skill}
                    installing={installingSlug === skill.slug}
                    installed={installedSlugs.has(skill.slug)}
                    failed={failedSlugs.get(skill.slug) ?? null}
                    installLogs={installingSlug === skill.slug ? installLogs : []}
                    expanded={expandedSlug === skill.slug}
                    onToggleExpand={() => setExpandedSlug(expandedSlug === skill.slug ? null : skill.slug)}
                    onInstall={() => handleInstall(skill.slug)}
                    formatNum={formatNum}
                    t={t}
                  />
                ))}
                {visibleCount < filtered.length && (
                  <div className="py-3 text-center text-[13px] text-[hsl(var(--muted-foreground))]">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-1.5" />
                    {filtered.length - visibleCount} more...
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Install logs overlay */}
          {installingSlug && installLogs.length > 0 && (
            <div className="shrink-0 log-stream rounded-[10px] bg-[hsl(var(--card))] border border-[hsl(var(--border))]/60 px-3.5 py-2.5 max-h-[100px] overflow-y-auto">
              {installLogs.map((l, i) => (
                <div key={i} className="text-[hsl(var(--muted-foreground))] py-[2px]">
                  <span className="text-[hsl(var(--primary))]/40 mr-1.5">›</span>
                  {l}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* My Skills tab — fill available height */}
      {tab === "myskills" && (
        <div className="flex flex-col flex-1 min-h-0">
          <SkillsCard />
        </div>
      )}
    </div>
  );
}

// ─── Market Skill Row ───────────────────────────────────────────────────────

interface MarketSkillRowProps {
  skill: MarketSkill;
  installing: boolean;
  installed: boolean;
  failed: string | null;
  installLogs: string[];
  expanded: boolean;
  onToggleExpand: () => void;
  onInstall: () => void;
  formatNum: (n: number) => string;
  t: (key: LocaleKeys) => string;
}

function MarketSkillRow({
  skill,
  installing,
  installed,
  failed,
  expanded,
  onToggleExpand,
  onInstall,
  formatNum,
  t,
}: MarketSkillRowProps) {
  return (
    <div
      className={cn(
        "transition-colors",
        installed
          ? "bg-emerald-50/50 hover:bg-emerald-50/80"
          : "hover:bg-[hsl(var(--background))]"
      )}
    >
      {/* Main row — clickable */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer"
        onClick={onToggleExpand}
      >
        <div className="flex-1 min-w-0 mr-3">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-medium truncate">{skill.name}</span>
            {skill.version && (
              <span className="text-[11px] text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted))] px-1.5 py-0.5 rounded-[4px] shrink-0">
                {skill.version}
              </span>
            )}
            {failed && !installing && (
              <span className="text-[11px] text-red-600 bg-red-50 px-1.5 py-0.5 rounded-[4px] shrink-0 font-medium">
                {t("market.installFail")}
              </span>
            )}
          </div>
          <p className={cn(
            "text-[13px] text-[hsl(var(--muted-foreground))] mt-0.5",
            !expanded && "truncate"
          )}>
            {skill.description}
          </p>
          {!expanded && (
            <div className="flex items-center gap-3 mt-1">
              <span className="flex items-center gap-1 text-[11px] text-[hsl(var(--muted-foreground))]">
                <Download className="w-3 h-3" />
                {formatNum(skill.downloads)}
              </span>
              <span className="flex items-center gap-1 text-[11px] text-[hsl(var(--muted-foreground))]">
                <Star className="w-3 h-3" />
                {formatNum(skill.stars)}
              </span>
              {skill.tags.length > 0 && (
                <span className="text-[11px] text-[hsl(var(--muted-foreground))]/60 truncate">
                  {skill.tags.slice(0, 3).join(" · ")}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Install button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (!installing && !installed) onInstall();
          }}
          disabled={installing || installed}
          className={cn(
            "shrink-0 text-[13px] font-medium px-3.5 py-1.5 rounded-full transition-all",
            installed
              ? "bg-emerald-100 text-emerald-700"
              : failed
              ? "bg-red-50 text-red-500 hover:bg-red-100"
              : installing
              ? "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"
              : "bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/20"
          )}
        >
          {installed ? (
            t("market.installDone")
          ) : installing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : failed ? (
            t("market.retry")
          ) : (
            t("market.install")
          )}
        </button>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-3 pt-0 space-y-2">
          {/* Stats row */}
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1 text-[12px] text-[hsl(var(--muted-foreground))]">
              <Download className="w-3.5 h-3.5" />
              {formatNum(skill.downloads)} {t("market.downloads")}
            </span>
            <span className="flex items-center gap-1 text-[12px] text-[hsl(var(--muted-foreground))]">
              <Star className="w-3.5 h-3.5" />
              {formatNum(skill.stars)} {t("market.stars")}
            </span>
            {skill.owner && (
              <span className="flex items-center gap-1 text-[12px] text-[hsl(var(--muted-foreground))]">
                <User className="w-3.5 h-3.5" />
                {skill.owner}
              </span>
            )}
          </div>

          {/* Tags */}
          {skill.tags.length > 0 && (
            <div className="flex items-start gap-1.5 flex-wrap">
              <Tag className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))] mt-0.5 shrink-0" />
              {skill.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-[11px] px-2 py-0.5 rounded-full bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Error detail */}
          {failed && !installing && (
            <p className="text-[12px] text-red-500/80">
              {failed}
            </p>
          )}

          {/* Links */}
          <div className="flex items-center gap-3">
            {skill.homepage && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(skill.homepage!, "_blank");
                }}
                className="inline-flex items-center gap-1 text-[13px] text-[hsl(var(--primary))] hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                {t("market.homepage")}
              </button>
            )}
            <span className="text-[12px] text-[hsl(var(--muted-foreground))]">
              slug: {skill.slug}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
