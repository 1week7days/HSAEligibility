import * as cheerio from "cheerio";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL = "https://hsastore.com";
const AJAX_PATH = "/on/demandware.store/Sites-HSASTORE-Site/default/Elist-ShowAjax";
const OUTPUT_JSON = "data/hsa-eligibility-list.json";
const OUTPUT_CSV = "data/hsa-eligibility-list.csv";
const LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");
const REQUEST_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
  "x-requested-with": "XMLHttpRequest",
  accept: "application/json, text/javascript, */*; q=0.01"
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function absoluteUrl(url) {
  if (!url) return null;
  try {
    return new URL(url, BASE_URL).toString();
  } catch {
    return null;
  }
}

function buildFirstPageUrl(letter) {
  const url = new URL(AJAX_PATH, BASE_URL);
  url.searchParams.set("cgid", `el-${letter}`);
  url.searchParams.set("accountType", "at1");
  url.searchParams.set("searchTerm", "");
  url.searchParams.set("selectedFilters", "");
  url.searchParams.set("serviceOrProduct", "");
  url.searchParams.set("tpaParams", "");
  return url.toString();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelayMs() {
  return 300 + Math.floor(Math.random() * 501);
}

async function fetchJsonWithRetry(url, maxAttempts = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await delay(randomDelayMs());

      const response = await fetch(url, { headers: REQUEST_HEADERS });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        const backoffMs = 500 * 2 ** (attempt - 1);
        console.warn(
          `Request failed, retrying (${attempt}/${maxAttempts}) in ${backoffMs}ms: ${url} - ${error.message}`
        );
        await delay(backoffMs);
      }
    }
  }

  throw lastError;
}

function firstText($root, selectors) {
  for (const selector of selectors) {
    const text = normalizeWhitespace($root.find(selector).first().text());
    if (text) return text;
  }
  return "";
}

function firstAttr($root, selectors, attr) {
  for (const selector of selectors) {
    const value = $root.find(selector).first().attr(attr);
    if (value) return value;
  }
  return "";
}

function categoryFromShopHref(href) {
  if (!href) return null;
  try {
    const url = new URL(href, BASE_URL);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length === 0 || parts[0] === "search") return null;
    return parts
      .at(-1)
      .replace(/-/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  } catch {
    return null;
  }
}

function parseItemsFromHtml(html, scrapedAt) {
  if (!html || !normalizeWhitespace(html)) {
    console.warn("Warning: endpoint returned empty HTML.");
    return [];
  }

  const $ = cheerio.load(html);
  const cardSelectors = [".c-elist__col", "[data-href*='/hsa-eligibility-list/']", ".jsElistCard", ".card"];
  let cards = $();

  for (const selector of cardSelectors) {
    cards = $(selector);
    if (cards.length > 0) break;
  }

  const items = [];

  cards.each((_, element) => {
    const $card = $(element);
    const name = firstText($card, [
      ".c-elist__card__heading__title",
      "[class*='heading__title']",
      ".card-title",
      "h2",
      "h3",
      "a[href*='/hsa-eligibility-list/']"
    ]);

    if (!name) return;

    const description = firstText($card, [
      ".c-elist__card__description",
      "[class*='description']",
      ".card-text",
      "p"
    ]);
    const eligibilityStatus =
      firstText($card, [
        ".c-elist__card__heading__type",
        "[class*='heading__type']",
        "[class*='eligib']",
        ".badge"
      ]) || null;
    const detailHref =
      firstAttr($card, [".c-elist__card__action a", "a[href*='/hsa-eligibility-list/']"], "href") ||
      $card.attr("data-href") ||
      "";
    const shopHref = firstAttr(
      $card,
      [".c-elist__card__heading__link", ".js-shop-link", "a[href]:not([href*='/hsa-eligibility-list/'])"],
      "href"
    );

    items.push({
      name,
      normalizedName: normalizeName(name),
      description,
      eligibilityStatus,
      category: categoryFromShopHref(shopHref),
      sourceUrl: absoluteUrl(detailHref),
      source: "hsastore",
      scrapedAt
    });
  });

  return items;
}

function dedupeItems(items) {
  const seen = new Set();
  const deduped = [];

  for (const item of items) {
    const key = `${item.normalizedName}::${item.sourceUrl ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

function toCsv(items) {
  const columns = [
    "name",
    "normalizedName",
    "description",
    "eligibilityStatus",
    "category",
    "sourceUrl",
    "source",
    "scrapedAt"
  ];
  const escapeCell = (value) => {
    const text = value == null ? "" : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };

  return [columns.join(","), ...items.map((item) => columns.map((column) => escapeCell(item[column])).join(","))].join(
    "\n"
  );
}

async function scrapeLetter(letter, scrapedAt, startingTotal = 0) {
  const items = [];
  let page = 1;
  let nextUrl = buildFirstPageUrl(letter);

  while (nextUrl) {
    let response;
    try {
      response = await fetchJsonWithRetry(nextUrl);
    } catch (error) {
      console.error(`Failed letter ${letter.toUpperCase()} page ${page} after retries: ${error.message}`);
      break;
    }

    const pageItems = parseItemsFromHtml(response.html, scrapedAt);
    items.push(...pageItems);
    console.log(
      `Letter ${letter.toUpperCase()} page ${page}: extracted ${pageItems.length} items, total ${
        startingTotal + items.length
      }`
    );

    /*
     * Pagination is controlled by the Demandware Ajax response. The first URL is
     * built with cgid=el-{letter}. After that, the server tells us whether more
     * records exist via showLoadMore and provides the next relative loadMoreUrl.
     * We do not guess page counts or increment pages manually.
     */
    if (response.showLoadMore && response.loadMoreUrl) {
      nextUrl = absoluteUrl(response.loadMoreUrl);
      page += 1;
    } else {
      nextUrl = null;
    }
  }

  return items;
}

export async function scrapeHsaEligibilityList() {
  const scrapedAt = new Date().toISOString();
  const allItems = [];

  for (const letter of LETTERS) {
    console.log(`Starting letter ${letter.toUpperCase()}`);
    const letterItems = await scrapeLetter(letter, scrapedAt, allItems.length);
    allItems.push(...letterItems);
    console.log(`Finished letter ${letter.toUpperCase()}: running total ${dedupeItems(allItems).length}`);
  }

  return dedupeItems(allItems).sort((a, b) => a.normalizedName.localeCompare(b.normalizedName));
}

async function runCli() {
  const items = await scrapeHsaEligibilityList();
  const jsonPath = path.join(repoRoot, OUTPUT_JSON);
  const csvPath = path.join(repoRoot, OUTPUT_CSV);

  await mkdir(path.dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(items, null, 2)}\n`);
  await writeFile(csvPath, `${toCsv(items)}\n`);

  console.log(`Saved ${items.length} deduplicated items to ${OUTPUT_JSON}`);
  console.log(`Saved ${items.length} deduplicated items to ${OUTPUT_CSV}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
