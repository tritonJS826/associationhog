import { fetchHtml, delay } from './fetch.js';
import { upsertPost, descriptionHash } from './db.js';

const BASE_URL = 'https://www.kupujemprodajem.com';

function extractNextData(html) {
  const start = html.indexOf('__NEXT_DATA__');
  if (start === -1) {
    throw new Error('__NEXT_DATA__ not found in page');
  }
  const open = html.indexOf('>', start);
  const close = html.indexOf('</script>', open);
  if (open === -1 || close === -1) {
    throw new Error('__NEXT_DATA__ script tag malformed');
  }
  return JSON.parse(html.slice(open + 1, close));
}

function stripHtml(str) {
  return (str ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeListAd(ad, source) {
  const title = ad.name || null;
  const description = stripHtml(ad.description_snippet_decoded || ad.description_snippet) || null;
  const images = [];
  if (ad.photo1_tmb_300x300) images.push('https://images.kupujemprodajem.com' + ad.photo1_tmb_300x300);
  else if (ad.photo_path1) images.push('https://images.kupujemprodajem.com' + ad.photo_path1);

  return {
    id: String(ad.ad_id),
    source,
    url: ad.ad_url ? BASE_URL + ad.ad_url : null,
    title,
    description,
    description_hash: descriptionHash(description, title),
    city: ad.location_name || null,
    price: ad.price_text || (ad.price ? String(ad.price) : null),
    images: images.length ? JSON.stringify(images) : null,
    raw: JSON.stringify(ad),
  };
}

function normalizeDetailAd(detail, source, fallback) {
  const title = detail.name || fallback.title;
  const description = stripHtml(detail.description) || fallback.description;
  const images = [];
  if (detail.image) images.push(detail.image);
  if (Array.isArray(detail.photos)) {
    for (const p of detail.photos) {
      const url = p.original || p.thumbnail;
      if (url) images.push(url);
    }
  }
  if (detail.photosBig) images.push(detail.photosBig);

  return {
    id: String(detail.id),
    source,
    url: detail.adUrl ? BASE_URL + detail.adUrl : fallback.url,
    title,
    description,
    description_hash: descriptionHash(description, title),
    city: detail.location || fallback.city,
    price: detail.priceText || detail.priceDisplay || fallback.price,
    images: images.length ? JSON.stringify([...new Set(images)]) : fallback.images,
    raw: JSON.stringify(detail),
  };
}

function lastSearchResult(data) {
  return data.props?.initialReduxState?.search?.lastSearchResult ?? null;
}

export async function scrapeKupujemProdajem({
  url,
  source = 'kupujemprodajem',
  maxPages = Infinity,
  delayMs = 3000,
  fetchDetails = true,
} = {}) {
  const first = await fetchHtml(url);
  const data = extractNextData(first.text);
  const lastResult = lastSearchResult(data);
  if (!lastResult) {
    throw new Error('search results not found in page (lastSearchResult is null)');
  }
  const totalPages = lastResult.pages ?? 1;
  const totalCount = lastResult.total ?? 0;
  const pages = Math.min(totalPages, maxPages === Infinity ? totalPages : maxPages);

  console.log(`[kupujemprodajem] source: ${source}`);
  console.log(`[kupujemprodajem] total ads: ${totalCount}, pages: ${totalPages}, fetching: ${pages}`);

  let saved = 0;
  let duplicates = 0;

  for (let page = 1; page <= pages; page++) {
    const pageUrl = url.replace(/\/\d+$/, `/${page}`);
    let pageData;
    if (page === 1) {
      pageData = data;
    } else {
      const res = await fetchHtml(pageUrl);
      pageData = extractNextData(res.text);
      await delay(delayMs);
    }

    const pageResult = lastSearchResult(pageData);
    if (!pageResult) {
      console.warn(`[kupujemprodajem] page ${page}: no search results (lastSearchResult is null); stopping`);
      break;
    }
    const ads = pageResult.ads ?? [];
    for (const ad of ads) {
      const listPost = normalizeListAd(ad, source);

      let post = listPost;
      if (fetchDetails && listPost.url) {
        try {
          const detailRes = await fetchHtml(listPost.url);
          const detailData = extractNextData(detailRes.text);
          const byId = detailData.props?.initialReduxState?.ad?.byId ?? {};
          const detail = byId[String(ad.ad_id)];
          if (detail) post = normalizeDetailAd(detail, source, listPost);
        } catch (err) {
          console.warn(`  [kupujemprodajem] detail fetch failed for ${ad.ad_id}: ${err.message}; using list data`);
        }
        await delay(delayMs);
      }

      const result = upsertPost(post);
      if (result.duplicate) duplicates++;
      else saved++;
    }
    console.log(`[kupujemprodajem] page ${page}/${pages}: ${ads.length} ads`);
  }

  console.log(`[kupujemprodajem] done. inserted/updated: ${saved}, duplicates skipped: ${duplicates}`);
  return { saved, duplicates, totalCount, totalPages, pages };
}