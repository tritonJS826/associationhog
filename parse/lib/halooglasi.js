import { fetchHtml, delay } from './fetch.js';
import { upsertPost, descriptionHash } from './db.js';

const BASE_URL = 'https://www.halooglasi.com';

function extractServerListData(html) {
  const marker = 'serverListData=';
  const start = html.indexOf(marker);
  if (start === -1) {
    throw new Error('serverListData not found in page');
  }
  const open = html.indexOf('{', start);
  let depth = 0;
  let inString = false;
  let esc = false;
  for (let i = open; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
    } else if (c === '{') {
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0) {
        return JSON.parse(html.slice(open, i + 1));
      }
    }
  }
  throw new Error('serverListData object not closed');
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x27;/g, "'");
}

function stripTags(str) {
  return str.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseListHtml(listHtml) {
  const html = decodeEntities(listHtml || '');
  const result = { description: null, images: [], imageCount: null, price: null, city: null, publishDate: null };

  const descMatch = html.match(/<p class="text-description-list product-description[^"]*">([\s\S]*?)<\/p>/);
  if (descMatch) result.description = stripTags(descMatch[1]);

  for (const m of html.matchAll(/<img src='([^']+)'/g)) {
    result.images.push(m[1]);
  }

  const countMatch = html.match(/pi-img-count-num">(\d+)</);
  if (countMatch) result.imageCount = parseInt(countMatch[1], 10);

  const priceMatch = html.match(/central-feature"><span data-value="([^"]*)"/);
  if (priceMatch) result.price = priceMatch[1] || null;

  const cityMatch = html.match(/data-field-name='grad_s' data-field-value='([^']*)'>([^<]*)</);
  if (cityMatch) result.city = (cityMatch[2] || cityMatch[1]).replace(/&nbsp;/g, ' ').trim();

  const dateMatch = html.match(/publish-date">([^<]*)</);
  if (dateMatch) result.publishDate = dateMatch[1].trim();

  return result;
}

function normalizeAd(ad, source) {
  const parsed = parseListHtml(ad.ListHTML);
  const description = ad.Text || parsed.description;
  const title = ad.Title || null;
  return {
    id: String(ad.Id),
    source,
    url: ad.RelativeUrl ? BASE_URL + ad.RelativeUrl : null,
    title,
    description,
    description_hash: descriptionHash(description, title),
    city: ad.City || parsed.city,
    price: parsed.price,
    images: parsed.images.length ? JSON.stringify(parsed.images) : null,
    raw: JSON.stringify(ad),
  };
}

export async function scrapeHaloOglasi({
  url,
  source = 'halooglasi',
  maxPages = Infinity,
  delayMs = 2000,
} = {}) {
  const first = await fetchHtml(url);
  const data = extractServerListData(first.text);
  const totalPages = data.TotalPages ?? 1;
  const totalCount = data.TotalCount ?? 0;
  const pages = Math.min(totalPages, maxPages === Infinity ? totalPages : maxPages);

  console.log(`[halooglasi] source: ${source}`);
  console.log(`[halooglasi] total ads: ${totalCount}, pages: ${totalPages}, fetching: ${pages}`);

  let saved = 0;
  let duplicates = 0;
  for (let page = 1; page <= pages; page++) {
    const pageUrl = `${url}&page=${page}`;
    let pageData;
    if (page === 1) {
      pageData = data;
    } else {
      const res = await fetchHtml(pageUrl);
      pageData = extractServerListData(res.text);
      await delay(delayMs);
    }

    const ads = pageData.Ads ?? [];
    for (const ad of ads) {
      const result = upsertPost(normalizeAd(ad, source));
      if (result.duplicate) duplicates++;
      else saved++;
    }
    console.log(`[halooglasi] page ${page}/${pages}: ${ads.length} ads`);
  }

  console.log(`[halooglasi] done. inserted/updated: ${saved}, duplicates skipped: ${duplicates}`);
  return { saved, duplicates, totalCount, totalPages, pages };
}