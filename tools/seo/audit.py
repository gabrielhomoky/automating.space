#!/usr/bin/env python3
"""
automating.hu — SEO / AEO / GEO audit harness.

Scores the live site against an itemized, weighted rubric. Every check returns
(points_earned, points_possible, evidence) so a score can always be traced back
to the thing that produced it. Run:

    python3 tools/seo/audit.py                 # audit production
    python3 tools/seo/audit.py --base http://localhost:8788
    python3 tools/seo/audit.py --json out.json

External facts that cannot be measured from the site itself (search-index
presence, third-party profiles, backlinks) are read from tools/seo/external.json
so they are explicit, dated and reviewable rather than hidden constants.
"""
import argparse, json, os, re, sys, html, urllib.parse
from concurrent.futures import ThreadPoolExecutor
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 seo-audit/1.0"

# ---------------------------------------------------------------- fetching
_cache = {}
def fetch(url, ua=UA, method="GET"):
    key = (url, ua, method)
    if key in _cache: return _cache[key]
    req = urllib.request.Request(url, method=method, headers={"User-Agent": ua, "Accept-Language": "hu,en"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read().decode("utf-8", "replace") if method == "GET" else ""
            res = dict(status=r.status, headers={k.lower(): v for k, v in r.headers.items()}, body=body, url=r.url)
    except urllib.error.HTTPError as e:
        res = dict(status=e.code, headers={k.lower(): v for k, v in e.headers.items()}, body=e.read().decode("utf-8", "replace"), url=url)
    except Exception as e:
        res = dict(status=0, headers={}, body="", url=url, error=str(e))
    _cache[key] = res
    return res

def head_no_redirect(url):
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *a, **k): return None
    op = urllib.request.build_opener(NoRedirect)
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": UA})
    try:
        with op.open(req, timeout=20) as r:
            return r.status, {k.lower(): v for k, v in r.headers.items()}
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in e.headers.items()}
    except Exception:
        return 0, {}

# ---------------------------------------------------------------- parsing
def strip_noise(h):
    h = re.sub(r"<script.*?</script>", " ", h, flags=re.S | re.I)
    h = re.sub(r"<style.*?</style>", " ", h, flags=re.S | re.I)
    h = re.sub(r"<!--.*?-->", " ", h, flags=re.S)
    return h

def visible_text(h):
    t = re.sub(r"<[^>]+>", " ", strip_noise(h))
    return re.sub(r"\s+", " ", html.unescape(t)).strip()

def head_of(h):
    m = re.search(r"<head[^>]*>(.*?)</head>", h, flags=re.S | re.I)
    return m.group(1) if m else h[:20000]

def jsonld(h):
    out = []
    for m in re.finditer(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>', h, flags=re.S | re.I):
        raw = m.group(1).strip()
        try: out.append(json.loads(raw))
        except Exception: out.append({"__parse_error__": raw[:200]})
    return out

def flatten_ld(objs):
    """All schema nodes, flattened out of @graph / arrays."""
    flat = []
    def walk(o):
        if isinstance(o, list):
            for i in o: walk(i)
        elif isinstance(o, dict):
            if "@graph" in o:
                walk(o["@graph"])
                rest = {k: v for k, v in o.items() if k != "@graph"}
                if len(rest) > 1: flat.append(rest)
            else:
                flat.append(o)
                for v in o.values():
                    if isinstance(v, (list, dict)): walk(v)
    walk(objs)
    return flat

def ld_types(objs):
    ts = set()
    for n in flatten_ld(objs):
        t = n.get("@type")
        if isinstance(t, str): ts.add(t)
        elif isinstance(t, list): ts.update(t)
    return ts

def meta(h, name=None, prop=None):
    pat = rf'<meta[^>]+(?:name|property)=["\']{re.escape(name or prop)}["\'][^>]*>'
    m = re.search(pat, h, flags=re.I)
    if not m: return None
    c = re.search(r'content=["\'](.*?)["\']', m.group(0), flags=re.S | re.I)
    return html.unescape(c.group(1)) if c else None

# ---------------------------------------------------------------- rubric
class Rubric:
    def __init__(self, name):
        self.name, self.items = name, []
    def add(self, cat, key, earned, possible, evidence):
        self.items.append(dict(category=cat, key=key, earned=round(float(earned), 2),
                               possible=possible, evidence=evidence))
    def score(self):
        e = sum(i["earned"] for i in self.items); p = sum(i["possible"] for i in self.items)
        return round(100.0 * e / p, 1) if p else 0.0
    def by_category(self):
        cats = {}
        for i in self.items:
            c = cats.setdefault(i["category"], [0.0, 0])
            c[0] += i["earned"]; c[1] += i["possible"]
        return {k: dict(earned=round(v[0], 2), possible=v[1],
                        pct=round(100.0 * v[0] / v[1], 1) if v[1] else 0) for k, v in cats.items()}

def frac(n, d):
    return 0.0 if not d else min(1.0, n / d)

# ---------------------------------------------------------------- site model
class Site:
    def __init__(self, base):
        self.base = base.rstrip("/")
        self.robots = fetch(self.base + "/robots.txt")
        self.sitemap = fetch(self.base + "/sitemap.xml")
        self.llms = fetch(self.base + "/llms.txt")
        self.llms_full = fetch(self.base + "/llms-full.txt")
        self.sitemap_urls = re.findall(r"<loc>(.*?)</loc>", self.sitemap["body"])
        self.pages = {}
        paths = ["/", "/case-studies", "/blog", "/blog-en",
                 "/blog/ai-telefonos-asszisztens-ara", "/blog/ai-telefonos-asszisztens-magyarul",
                 "/blog/email-automatizalas-ai", "/blog/mit-lehet-automatizalni-kisvallalkozasban",
                 "/blog/ai-phone-assistant-cost-en", "/blog/ai-phone-assistant-en",
                 "/blog/email-automation-ai-en", "/blog/what-to-automate-en",
                 "/impresszum", "/privacy", "/terms", "/en"]
        with ThreadPoolExecutor(8) as ex:
            list(ex.map(lambda p: self.pages.__setitem__(p, fetch(self.base + p)), paths))
        self.live = {p: r for p, r in self.pages.items() if r["status"] == 200}
        # money pages = the ones that should carry the full treatment
        self.content_pages = [p for p in self.live if p in ("/", "/case-studies", "/blog", "/blog-en", "/en")
                              or p.startswith("/blog/")]
        self.articles = [p for p in self.live if p.startswith("/blog/")]

    def body(self, p): return self.pages.get(p, {}).get("body", "")

EXT_DEFAULT = {
    "note": "Externally verified facts. Update with evidence + date when re-audited.",
    "google_indexed_pages": 0, "bing_indexed_pages": 0,
    "sameas_verified": [], "wikidata": False, "wikipedia": False,
    "third_party_citations": 0, "google_business_profile": False,
    "indexnow_submitted": False, "gsc_verified": False, "bing_wmt_verified": False,
    "lighthouse": {},
}
def load_external():
    p = os.path.join(HERE, "external.json")
    if os.path.exists(p):
        d = json.load(open(p)); base = dict(EXT_DEFAULT); base.update(d); return base
    return dict(EXT_DEFAULT)

# ================================================================ SEO
def audit_seo(s, ext):
    r = Rubric("SEO")
    C = "Crawlability & indexing"
    rb = s.robots["body"]
    ok = s.robots["status"] == 200 and "user-agent" in rb.lower()
    r.add(C, "robots.txt served & valid", 2 if ok else 0, 2, f"status={s.robots['status']}")
    smaps = re.findall(r"(?im)^sitemap:\s*(\S+)", rb)
    r.add(C, "sitemap declared in robots.txt", 2 if smaps else 0, 2, f"{smaps}")
    r.add(C, "sitemap.xml valid XML", 2 if s.sitemap["status"] == 200 and "<urlset" in s.sitemap["body"] else 0, 2,
          f"status={s.sitemap['status']} urls={len(s.sitemap_urls)}")

    expected = {s.base + p for p in s.content_pages} | {s.base + "/" , s.base + "/impresszum", s.base + "/privacy", s.base + "/terms"}
    expected = {u.rstrip("/") + "/" if u == s.base else u for u in expected}
    have = {u.rstrip("/") if u != s.base + "/" else u for u in s.sitemap_urls}
    exp_norm = {u.rstrip("/") if u != s.base + "/" else u for u in expected}
    missing = sorted(exp_norm - have)
    r.add(C, "sitemap covers every indexable page", 6 * (1 - frac(len(missing), max(1, len(exp_norm)))), 6,
          f"missing={missing}" if missing else "complete")
    dead = []
    for u in s.sitemap_urls:
        st, _ = head_no_redirect(u)
        if st not in (200,): dead.append((u, st))
    r.add(C, "every sitemap URL answers 200 directly", 3 * (1 - frac(len(dead), max(1, len(s.sitemap_urls)))), 3,
          f"non-200={dead}" if dead else "all 200")
    lastmods = re.findall(r"<lastmod>(.*?)</lastmod>", s.sitemap["body"])
    r.add(C, "lastmod on every sitemap entry", 2 * frac(len(lastmods), max(1, len(s.sitemap_urls))), 2,
          f"{len(lastmods)}/{len(s.sitemap_urls)}")
    st_www, h_www = head_no_redirect("https://www." + s.base.split("//")[1] + "/")
    r.add(C, "www -> apex single-hop 301", 2 if st_www == 301 else 0, 2, f"{st_www} -> {h_www.get('location')}")
    st_http, h_http = head_no_redirect("http://" + s.base.split("//")[1] + "/")
    r.add(C, "http -> https 301", 2 if st_http == 301 else 0, 2, f"{st_http} -> {h_http.get('location')}")
    st404, _ = head_no_redirect(s.base + "/definitely-not-a-page-xyz")
    r.add(C, "unknown path returns 404", 2 if st404 == 404 else 0, 2, f"{st404}")

    O = "On-page"
    titles, descs, bad_h1, thin = {}, {}, [], []
    for p in s.content_pages:
        b = s.body(p); h = head_of(b)
        t = re.search(r"<title>(.*?)</title>", h, flags=re.S)
        t = html.unescape(t.group(1).strip()) if t else ""
        titles[p] = t
        d = meta(h, "description") or ""
        descs[p] = d
        h1 = re.findall(r"<h1[\s>]", strip_noise(b))
        if len(h1) != 1: bad_h1.append((p, len(h1)))
        if len(visible_text(b).split()) < 600: thin.append((p, len(visible_text(b).split())))
    n = max(1, len(s.content_pages))
    good_t = [p for p, t in titles.items() if 15 <= len(t) <= 65]
    r.add(O, "title present, unique, 15-65 chars", 4 * frac(len(good_t), n) * (1 if len(set(titles.values())) == len(titles) else 0.6), 4,
          f"{len(good_t)}/{n} in range; unique={len(set(titles.values()))}/{len(titles)}")
    good_d = [p for p, d in descs.items() if 70 <= len(d) <= 165]
    r.add(O, "meta description present, unique, 70-165 chars", 4 * frac(len(good_d), n) * (1 if len(set(descs.values())) == len(descs) else 0.6), 4,
          f"{len(good_d)}/{n}; short/long: {[(p,len(d)) for p,d in descs.items() if not 70<=len(d)<=165]}")
    r.add(O, "exactly one H1 per page", 4 * (1 - frac(len(bad_h1), n)), 4, f"violations={bad_h1}")
    r.add(O, "no thin content on indexable pages (>=600 words)", 4 * (1 - frac(len(thin), n)), 4, f"thin={thin}")
    imgs = re.findall(r"<img[^>]*>", strip_noise(s.body("/")))
    noalt = [i for i in imgs if "alt=" not in i]
    nodim = [i for i in imgs if not ("width=" in i and "height=" in i)]
    r.add(O, "images: alt + intrinsic dimensions", 3 * (1 - frac(len(noalt) + len(nodim), max(1, 2 * len(imgs)))), 3,
          f"imgs={len(imgs)} noalt={len(noalt)} nodim={len(nodim)}")
    # internal links
    weak = []
    for p in s.content_pages:
        links = set(re.findall(r'href="(/[^"#?]*)"', strip_noise(s.body(p))))
        if len(links) < 8: weak.append((p, len(links)))
    r.add(O, "internal linking depth (>=8 internal links/page)", 3 * (1 - frac(len(weak), n)), 3, f"weak={weak}")
    r.add(O, "clean extensionless URLs", 2 if all(not u.endswith(".html") for u in s.sitemap_urls) else 0, 2, "sitemap URL shapes")

    I = "International"
    pairs_ok, pairs_total, xdef = 0, 0, 0
    for p in s.content_pages:
        h = head_of(s.body(p))
        alts = re.findall(r'<link[^>]+rel=["\']alternate["\'][^>]*hreflang=["\']([^"\']+)["\'][^>]*href=["\']([^"\']+)["\']', h) + \
               re.findall(r'<link[^>]+hreflang=["\']([^"\']+)["\'][^>]*rel=["\']alternate["\'][^>]*href=["\']([^"\']+)["\']', h)
        pairs_total += 1
        langs = {a[0] for a in alts}
        if {"hu", "en"} <= langs: pairs_ok += 1
        if "x-default" in langs: xdef += 1
    r.add(I, "hreflang hu+en on every page with a counterpart", 6 * frac(pairs_ok, n), 6, f"{pairs_ok}/{n} pages")
    r.add(I, "x-default declared", 2 * frac(xdef, n), 2, f"{xdef}/{n}")
    langs_ok = sum(1 for p in s.content_pages if re.search(r'<html[^>]+lang="(hu|en)"', s.body(p)))
    r.add(I, "html lang correct", 2 * frac(langs_ok, n), 2, f"{langs_ok}/{n}")

    S = "Structured data"
    home_types = ld_types(jsonld(s.body("/")))
    r.add(S, "Organization + WebSite on home", 3 if {"Organization", "WebSite"} <= home_types or ({"WebSite"} <= home_types and home_types & {"Organization","ProfessionalService","LocalBusiness"}) else 1.5, 3, f"{sorted(home_types)}")
    art_ok = sum(1 for p in s.articles if ld_types(jsonld(s.body(p))) & {"BlogPosting", "Article", "NewsArticle"})
    r.add(S, "Article schema on every article", 4 * frac(art_ok, max(1, len(s.articles))), 4, f"{art_ok}/{len(s.articles)}")
    bc = sum(1 for p in s.content_pages if "BreadcrumbList" in ld_types(jsonld(s.body(p))))
    r.add(S, "BreadcrumbList on non-home pages", 3 * frac(bc, max(1, n - 1)), 3, f"{bc}/{n-1}")
    parse_err = sum(1 for p in s.content_pages for o in jsonld(s.body(p)) if "__parse_error__" in str(o)[:60])
    r.add(S, "all JSON-LD parses", 3 if parse_err == 0 else 0, 3, f"parse errors={parse_err}")
    wp = sum(1 for p in s.content_pages if ld_types(jsonld(s.body(p))) & {"WebPage", "CollectionPage", "AboutPage", "ContactPage", "Blog", "BlogPosting", "ProfilePage"})
    r.add(S, "page-level type on every page", 2 * frac(wp, n), 2, f"{wp}/{n}")

    P = "Performance & CWV"
    lh = ext.get("lighthouse", {}).get("/", {})
    lcp = lh.get("lcp_s"); cls = lh.get("cls"); tbt = lh.get("tbt_ms"); perf = lh.get("performance")
    r.add(P, "LCP < 2.5s", 7 if (lcp is not None and lcp <= 2.5) else (3.5 if lcp and lcp <= 4 else 0), 7, f"LCP={lcp}s")
    r.add(P, "CLS < 0.1", 4 if (cls is not None and cls < 0.1) else 0, 4, f"CLS={cls}")
    r.add(P, "TBT < 200ms (INP proxy)", 4 if (tbt is not None and tbt < 200) else 0, 4, f"TBT={tbt}ms")
    r.add(P, "Lighthouse performance score", 5 * (perf / 100 if perf else 0), 5, f"perf={perf}")

    X = "Delivery & metadata"
    hh = s.pages["/"]["headers"]
    sec = sum(1 for k in ("strict-transport-security", "x-content-type-options", "referrer-policy") if k in hh)
    r.add(X, "security headers", 3 * frac(sec, 3), 3, f"{sorted(k for k in hh if k in ('strict-transport-security','x-content-type-options','referrer-policy'))}")
    og_ok = sum(1 for p in s.content_pages if all(meta(head_of(s.body(p)), prop=k) for k in ("og:title", "og:description", "og:image", "og:url")))
    r.add(X, "complete Open Graph", 3 * frac(og_ok, n), 3, f"{og_ok}/{n}")
    tw_ok = sum(1 for p in s.content_pages if meta(head_of(s.body(p)), "twitter:card"))
    r.add(X, "Twitter card", 2 * frac(tw_ok, n), 2, f"{tw_ok}/{n}")
    canon_ok = 0
    for p in s.content_pages:
        c = re.search(r'rel=["\']canonical["\'][^>]*href=["\']([^"\']+)', head_of(s.body(p)))
        if c and c.group(1).startswith("https://"): canon_ok += 1
    r.add(X, "absolute self-referencing canonical", 4 * frac(canon_ok, n), 4, f"{canon_ok}/{n}")
    return r

# ================================================================ AEO
Q_RE = re.compile(r"(?:\?|^\s*(?:mennyi|hogyan|mit|miért|mikor|hol|ki |kell|lehet|what|how|why|when|where|which|who|does|do |can |is |are ))", re.I)

def audit_aeo(s, ext):
    r = Rubric("AEO")
    n = max(1, len(s.content_pages))
    A = "Answer structure"
    faq_pages = [p for p in s.content_pages if "FAQPage" in ld_types(jsonld(s.body(p)))]
    r.add(A, "FAQ marked up where FAQ content exists", 8 * frac(len(faq_pages), max(1, len([p for p in s.content_pages if "kérdés" in visible_text(s.body(p)).lower() or "question" in visible_text(s.body(p)).lower() or p in s.articles]))), 8,
          f"FAQPage on {len(faq_pages)} pages: {faq_pages}")
    qh, tot_h = 0, 0
    for p in s.content_pages:
        hs = re.findall(r"<h[23][^>]*>(.*?)</h[23]>", strip_noise(s.body(p)), flags=re.S)
        hs = [re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", x))).strip() for x in hs]
        tot_h += len(hs); qh += sum(1 for x in hs if "?" in x or Q_RE.match(x))
    r.add(A, "question-shaped H2/H3 headings", 6 * min(1.0, (qh / max(1, tot_h)) / 0.30), 6, f"{qh}/{tot_h} question headings")
    # answer-first: <=320 chars of text right after a question heading
    good_ans = 0; q_count = 0
    for p in s.content_pages:
        b = strip_noise(s.body(p))
        for m in re.finditer(r"<h[23][^>]*>(.*?)</h[23]>(.{0,900})", b, flags=re.S):
            head_txt = re.sub(r"<[^>]+>", "", m.group(1)).strip()
            if "?" not in head_txt and not Q_RE.match(head_txt): continue
            q_count += 1
            first_p = re.search(r"<p[^>]*>(.*?)</p>", m.group(2), flags=re.S)
            if first_p:
                txt = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", first_p.group(1)))).strip()
                if 40 <= len(txt) <= 500: good_ans += 1
    r.add(A, "self-contained answer paragraph under each question", 6 * frac(good_ans, max(1, q_count)), 6, f"{good_ans}/{q_count}")
    lists = sum(len(re.findall(r"<(ul|ol|table)[\s>]", strip_noise(s.body(p)))) for p in s.content_pages)
    r.add(A, "lists/tables for extractable facts", 5 * min(1.0, lists / (2.0 * n)), 5, f"{lists} list/table blocks across {n} pages")
    lede_ok = 0
    for p in s.content_pages:
        t = visible_text(s.body(p))
        lede_ok += 1 if len(t.split()) > 40 else 0
    r.add(A, "answerable lede present", 5 * frac(lede_ok, n), 5, f"{lede_ok}/{n}")

    B = "Answer schema"
    r.add(B, "FAQPage / QAPage valid Question+Answer nodes", 7 * frac(sum(1 for p in s.content_pages if {"Question", "Answer"} <= ld_types(jsonld(s.body(p)))), max(1, len(s.articles) + 1)), 7,
          f"{[p for p in s.content_pages if 'Question' in ld_types(jsonld(s.body(p)))]}")
    spk = sum(1 for p in s.content_pages if "speakable" in s.body(p))
    r.add(B, "speakable specification", 3 * frac(spk, n), 3, f"{spk}/{n}")
    art_full = 0
    for p in s.articles:
        nodes = [x for x in flatten_ld(jsonld(s.body(p))) if x.get("@type") in ("BlogPosting", "Article")]
        if nodes and all(k in nodes[0] for k in ("headline", "datePublished", "dateModified", "author", "description")): art_full += 1
    r.add(B, "Article: headline+dates+author+description", 6 * frac(art_full, max(1, len(s.articles))), 6, f"{art_full}/{len(s.articles)}")
    ent = sum(1 for p in s.content_pages if re.search(r'"(about|mentions)"\s*:', s.body(p)))
    r.add(B, "about/mentions entity linking", 5 * frac(ent, n), 5, f"{ent}/{n}")
    off = sum(1 for p in s.content_pages if re.search(r'"(Offer|priceSpecification|price)"?\s*[:"]', s.body(p)))
    r.add(B, "offer/price machine-readable", 4 * frac(off, 3), 4, f"{off} pages expose price data")

    C = "Extractability"
    sem = 0
    for p in s.content_pages:
        b = s.body(p)
        sem += sum(1 for t in ("<main", "<article", "<section", "<nav", "<header", "<footer") if t in b) / 6.0
    r.add(C, "semantic HTML landmarks", 6 * frac(sem, n), 6, f"avg landmark coverage {round(sem/n,2)}")
    nojs = 0
    for p in s.content_pages:
        b = s.body(p)
        txt = visible_text(b)
        nojs += 1 if len(txt.split()) > 200 else 0
    r.add(C, "primary content in server HTML (no JS needed)", 7 * frac(nojs, n), 7, f"{nojs}/{n} pages carry >200 words in raw HTML")
    ratios = []
    for p in s.content_pages:
        b = s.body(p); ratios.append(len(visible_text(b)) / max(1, len(b)))
    r.add(C, "content-to-code ratio", 3 * min(1.0, (sum(ratios) / len(ratios)) / 0.12), 3, f"avg={round(sum(ratios)/len(ratios),4)}")
    facts = len(re.findall(r"\d[\d\s.,]*\s*(?:Ft|%|óra|perc|hét|nap|hours|minutes|weeks|days|HUF|EUR)", visible_text(s.body("/"))))
    r.add(C, "explicit numeric facts on home", 5 * min(1.0, facts / 12.0), 5, f"{facts} numeric facts")
    import datetime
    today = datetime.date.today()
    fresh = 0
    for p in s.articles:
        ds = re.findall(r'"dateModified":\s*"(\d{4}-\d{2}-\d{2})', s.body(p))
        if ds and (today - datetime.date.fromisoformat(max(ds))).days <= 120: fresh += 1
    r.add(C, "dateModified within 120 days", 4 * frac(fresh, max(1, len(s.articles))), 4, f"{fresh}/{len(s.articles)}")

    D = "Machine access"
    lt = s.llms["body"]
    llm_ok = s.llms["status"] == 200 and lt.startswith("#") and "> " in lt and "http" in lt
    r.add(D, "llms.txt present and well-formed", 5 if llm_ok else 0, 5, f"status={s.llms['status']} bytes={len(lt)}")
    r.add(D, "llms-full.txt full-corpus file", 4 if s.llms_full["status"] == 200 and len(s.llms_full["body"]) > 5000 else 0, 4,
          f"status={s.llms_full['status']} bytes={len(s.llms_full['body'])}")
    rb = s.robots["body"].lower()
    named = [b for b in ("gptbot", "oai-searchbot", "chatgpt-user", "claudebot", "perplexitybot", "google-extended", "bingbot", "applebot-extended") if b in rb]
    r.add(D, "AI crawlers explicitly addressed in robots.txt", 4 * frac(len(named), 6), 4, f"named={named}")
    codes = {}
    for ua in ("GPTBot/1.2", "ClaudeBot/1.0", "PerplexityBot/1.0", "OAI-SearchBot/1.0", "bingbot/2.0"):
        codes[ua] = fetch(s.base + "/", ua=ua)["status"]
    r.add(D, "AI crawlers actually served 200", 4 * frac(sum(1 for v in codes.values() if v == 200), len(codes)), 4, f"{codes}")
    md = sum(1 for p in s.content_pages if 'type="text/markdown"' in s.body(p) or 'rel="alternate"' in s.body(p) and '.md' in s.body(p))
    r.add(D, "markdown/plain-text alternates advertised", 3 * frac(md, n), 3, f"{md}/{n}")
    return r

# ================================================================ GEO
def audit_geo(s, ext):
    r = Rubric("GEO")
    n = max(1, len(s.content_pages))
    E = "Entity & authority"
    org = [x for x in flatten_ld(jsonld(s.body("/"))) if x.get("@type") in ("Organization", "ProfessionalService", "LocalBusiness", "Corporation") or (isinstance(x.get("@type"), list) and set(x["@type"]) & {"Organization", "ProfessionalService", "LocalBusiness"})]
    org = org[0] if org else {}
    sa = org.get("sameAs") or []
    if isinstance(sa, str): sa = [sa]
    r.add(E, "sameAs to verified external profiles (>=5)", 8 * frac(len(sa), 5), 8, f"{len(sa)} sameAs: {sa}")
    fields = ("name", "legalName", "url", "logo", "email", "address", "telephone", "description", "founder", "foundingDate", "vatID", "areaServed")
    have = [f for f in fields if org.get(f)]
    r.add(E, "Organization identity completeness", 7 * frac(len(have), len(fields)), 7, f"{len(have)}/{len(fields)}: missing={[f for f in fields if f not in have]}")
    persons = [x for x in flatten_ld(jsonld(s.body("/"))) if x.get("@type") == "Person"]
    p_sa = sum(1 for p in persons if p.get("sameAs"))
    r.add(E, "founders as Person entities with sameAs", 4 * frac(p_sa, 2), 4, f"{len(persons)} Person nodes, {p_sa} with sameAs")
    imp = s.body("/impresszum")
    nap = sum(1 for k in ("adószám", "székhely", "nyilvántartási", "e-mail") if k in imp.lower())
    r.add(E, "public legal identity (impresszum completeness)", 4 * frac(nap, 4), 4, f"{nap}/4 legal fields present")
    r.add(E, "Wikidata / Wikipedia entity", 4 * (1 if ext.get("wikidata") else 0), 4, f"wikidata={ext.get('wikidata')}")
    r.add(E, "third-party citations of the brand", 3 * frac(ext.get("third_party_citations", 0), 8), 3, f"{ext.get('third_party_citations')} verified citations")

    C = "Citation-worthiness"
    home_t = visible_text(s.body("/"))
    stats = len(re.findall(r"\d[\d\s.,]*\s*(?:Ft|%|óra|perc|hét|nap|\+)", home_t))
    all_stats = sum(len(re.findall(r"\d[\d\s.,]*\s*(?:Ft|%|óra|perc|hét|nap|hours|minutes|weeks|days)", visible_text(s.body(p)))) for p in s.content_pages)
    r.add(C, "statistics density (GEO: +30-40% visibility)", 7 * min(1.0, all_stats / (10.0 * n)), 7, f"{all_stats} statistics across {n} pages")
    quotes = sum(len(re.findall(r"[\"“„][^\"”]{40,}[\"”]", visible_text(s.body(p)))) for p in s.content_pages)
    r.add(C, "quotations", 5 * min(1.0, quotes / (1.0 * n)), 5, f"{quotes} quotations")
    ext_links = set()
    for p in s.content_pages:
        ext_links |= {u for u in re.findall(r'href="(https?://[^"]+)"', strip_noise(s.body(p))) if "automating.hu" not in u and "fonts.g" not in u}
    r.add(C, "outbound citations to authoritative sources", 6 * min(1.0, len(ext_links) / 8.0), 6, f"{len(ext_links)} distinct external refs: {sorted(ext_links)[:8]}")
    eeat = 0
    eeat += 1 if any("author" in json.dumps(jsonld(s.body(p))) for p in s.articles) else 0
    eeat += 1 if any(x.get("@type") == "Person" and x.get("sameAs") for p in s.content_pages for x in flatten_ld(jsonld(s.body(p)))) else 0
    eeat += 1 if any(x.get("@type") == "Person" and (x.get("jobTitle") or x.get("knowsAbout")) for p in s.content_pages for x in flatten_ld(jsonld(s.body(p)))) else 0
    eeat += 1 if "impresszum" in s.body("/") else 0
    r.add(C, "E-E-A-T signals (author identity, credentials, imprint)", 7 * frac(eeat, 4), 7, f"{eeat}/4")

    R = "Retrieval surface"
    r.add(R, "indexed in Google", 5 * frac(ext.get("google_indexed_pages", 0), 12), 5, f"{ext.get('google_indexed_pages')} pages")
    r.add(R, "indexed in Bing (feeds ChatGPT/Copilot)", 5 * frac(ext.get("bing_indexed_pages", 0), 12), 5, f"{ext.get('bing_indexed_pages')} pages")
    key = re.search(r"^[0-9a-f]{8,128}$", "", re.M)
    inx = fetch(s.base + "/indexnow-key.txt")["status"] == 200 or ext.get("indexnow_submitted")
    r.add(R, "IndexNow adopted (Bing/Yandex/Seznam instant indexing)", 4 if inx else 0, 4, f"indexnow={inx}")
    en_urls = [u for u in s.sitemap_urls if u.endswith("-en") or "/en" in u.replace(s.base, "")]
    r.add(R, "both languages at crawlable URLs in sitemap", 5 * frac(len(en_urls), 5), 5, f"{len(en_urls)} EN URLs in sitemap")
    r.add(R, "full-corpus machine file (llms-full.txt)", 3 if s.llms_full["status"] == 200 else 0, 3, f"{s.llms_full['status']}")
    import datetime
    today = datetime.date.today()
    lm = re.findall(r"<lastmod>(\d{4}-\d{2}-\d{2})", s.sitemap["body"])
    freshest = max(lm) if lm else "1970-01-01"
    age = (today - datetime.date.fromisoformat(freshest)).days
    r.add(R, "freshness signal (newest lastmod < 60 days)", 3 if age <= 60 else (1.5 if age <= 180 else 0), 3, f"newest lastmod {freshest} ({age}d old)")

    A = "Answer-space coverage"
    corpus = " ".join(visible_text(s.body(p)).lower() for p in s.content_pages)
    intents = {"pricing": ["ár", "mennyibe kerül", "költség", "cost", "price"],
               "how-it-works": ["hogyan működik", "how it works", "folyamat"],
               "comparison": ["helyett", "szemben", "vs", "versus", "alternatíva", "alternative"],
               "roi": ["megtérül", "roi", "megtakarítás", "saving"],
               "integration": ["integrác", "integrat", "api", "crm"],
               "compliance": ["gdpr", "ai act", "adatvéd", "privacy"],
               "use-cases": ["esettanulmány", "case stud", "iparág", "industry"],
               "getting-started": ["első lépés", "bevezetés", "get started", "onboarding"]}
    covered = [k for k, v in intents.items() if any(x in corpus for x in v)]
    r.add(A, "commercial intent coverage", 8 * frac(len(covered), len(intents)), 8, f"{covered}")
    brand_cooc = len(re.findall(r"automating", corpus))
    r.add(A, "brand + category co-occurrence", 4 * min(1.0, brand_cooc / 40.0), 4, f"{brand_cooc} brand mentions in body copy")
    proprietary = 0
    proprietary += 1 if re.search(r"\d[\d\s]*Ft", corpus) else 0
    proprietary += 1 if "esettanulmány" in corpus or "case stud" in corpus else 0
    proprietary += 1 if re.search(r"\d+\s*(hét|nap|hónap|week|day)", corpus) else 0
    r.add(A, "proprietary/unique data (prices, cases, timelines)", 6 * frac(proprietary, 3), 6, f"{proprietary}/3")
    r.add(A, "language coverage of the answer corpus", 2 * frac(len([p for p in s.content_pages if re.search(r'<html[^>]+lang="en"', s.body(p))]), 5), 2,
          f"{len([p for p in s.content_pages if re.search(chr(39)+'<html[^>]+lang=\"en\"'+chr(39), s.body(p))])} EN pages")
    return r

# ================================================================ main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="https://automating.hu")
    ap.add_argument("--json", default=None)
    ap.add_argument("--label", default="")
    a = ap.parse_args()
    ext = load_external()
    s = Site(a.base)
    out = {}
    for f in (audit_seo, audit_aeo, audit_geo):
        r = f(s, ext)
        out[r.name] = dict(score=r.score(), categories=r.by_category(), items=r.items)
    print(f"\n=== automating.hu audit {a.label} ({a.base}) ===")
    for k, v in out.items():
        print(f"\n{k}: {v['score']}/100")
        for c, d in v["categories"].items():
            print(f"   {c:<28} {d['earned']:>6}/{d['possible']:<4} {d['pct']:>5}%")
    print("\n--- failing / partial items ---")
    for k, v in out.items():
        for i in v["items"]:
            if i["earned"] < i["possible"] - 0.01:
                print(f"[{k}] {i['key']}: {i['earned']}/{i['possible']} — {str(i['evidence'])[:160]}")
    if a.json:
        json.dump(out, open(a.json, "w"), ensure_ascii=False, indent=1)
        print(f"\nwrote {a.json}")

if __name__ == "__main__":
    main()
