import { upsertPost, descriptionHash } from './db.js';
import { closeBrowser } from './fetch.js';

const BASE_URL = 'https://www.kupujemprodajem.com';

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

function extractAdId(href) {
  if (!href) return null;
  const match = href.match(/\/oglas\/(\d+)/);
  return match ? match[1] : null;
}

function parseListAdFromDom(article, source) {
  const link = article.querySelector('a[href*="/oglas/"]');
  const nameEl = article.querySelector('[class*=name]');
  const cityEl = article.querySelector('[class*=originAndPromoLocation]');
  const priceEl = article.querySelector('[class*=inlinePrice], [class*=price]');
  const imgEl = article.querySelector('img[src*="kupujemprodajem"]');
  const postedEl = article.querySelector('[class*=postedStatus]');

  const title = nameEl?.textContent?.trim() || link?.getAttribute('aria-label') || null;
  const href = link?.getAttribute('href');
  const id = extractAdId(href);
  const city = cityEl?.textContent?.trim() || null;
  const price = priceEl?.textContent?.trim() || null;
  const imgSrc = imgEl?.getAttribute('src') || null;
  const posted = postedEl?.textContent?.trim() || null;

  if (!id) return null;

  const url = href ? BASE_URL + href : null;
  const description = title;
  const images = imgSrc ? JSON.stringify([imgSrc]) : null;

  return {
    id,
    source,
    url,
    title,
    description,
    description_hash: descriptionHash(description, title),
    city,
    price,
    images,
    raw: JSON.stringify({ id, title, city, price, posted, imgSrc }),
  };
}

function parseDetailAdFromDom(page, source, fallback) {
  const data = page.__nextData;
  const byId = data?.props?.initialReduxState?.ad?.byId ?? {};
  const adId = fallback.id;
  const detail = byId[adId];

  if (detail) {
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

  // Fallback: extract from DOM
  const title = page.titleEl?.textContent?.trim() || fallback.title;
  const descEl = page.descEl?.textContent?.trim() || '';
  const description = stripHtml(descEl) || fallback.description;
  const price = page.priceEl?.textContent?.trim() || fallback.price;
  const images = page.imgSrcs?.length ? JSON.stringify(page.imgSrcs) : fallback.images;

  return {
    id: adId,
    source,
    url: fallback.url,
    title,
    description,
    description_hash: descriptionHash(description, title),
    city: fallback.city,
    price,
    images,
    raw: JSON.stringify({ title, description: description?.slice(0, 200), price }),
  };
}

<<<<<<< HEAD
function lastSearchResult(data) {
  return data.props?.initialReduxState?.search?.lastSearchResult ?? null;
=======
function extractPageInfo(pageEval) {
  const articles = document.querySelectorAll('article');
  const adLinks = [...articles].map(a => {
    const link = a.querySelector('a[href*="/oglas/"]');
    return link?.getAttribute('href');
  }).filter(Boolean);

  // Pagination
  const paginationLinks = document.querySelectorAll('a[href*="/grupa/"]');
  const pageNums = [...paginationLinks]
    .map(a => a.textContent?.trim())
    .filter(t => /^\d+$/.test(t))
    .map(Number);
  const maxPage = pageNums.length ? Math.max(...pageNums) : 1;

  // Total count - look for text like "957 rezultata"
  const totalText = document.body?.innerText?.match(/(\d[\d.]*)\s*oglas/);
  const total = totalText ? parseInt(totalText[1].replace(/\./g, ''), 10) : 0;

  return { adLinks, maxPage, total };
>>>>>>> e77c36f (fix cloudflare bot defence - parsing works fine now)
}

export async function scrapeKupujemProdajem({
  url,
  source = 'kupujemprodajem',
  maxPages = Infinity,
  delayMs = 3000,
  fetchDetails = true,
} = {}) {
<<<<<<< HEAD
  const first = await fetchHtml(url);
  const data = extractNextData(first.text);
  const lastResult = lastSearchResult(data);
  if (!lastResult) {
    throw new Error('search results not found in page (lastSearchResult is null)');
  }
  const totalPages = lastResult.pages ?? 1;
  const totalCount = lastResult.total ?? 0;
  const pages = Math.min(totalPages, maxPages === Infinity ? totalPages : maxPages);
=======
  const puppeteerExtra = (await import('puppeteer-extra')).default;
  const { default: StealthPlugin } = await import('puppeteer-extra-plugin-stealth');
  puppeteerExtra.use(StealthPlugin());
>>>>>>> e77c36f (fix cloudflare bot defence - parsing works fine now)

  const browser = await puppeteerExtra.launch({ headless: true, args: ['--no-sandbox'] });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // Load first page to get pagination info
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('article', { timeout: 15000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 5000));

<<<<<<< HEAD
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
=======
    const pageInfo = await page.evaluate(extractPageInfo);
    const totalPages = pageInfo.maxPage || 1;
    const totalCount = pageInfo.total || 0;
    const pages = Math.min(totalPages, maxPages === Infinity ? totalPages : maxPages);

    console.log(`[kupujemprodajem] source: ${source}`);
    console.log(`[kupujemprodajem] total ads: ${totalCount}, pages: ${totalPages}, fetching: ${pages}`);

    let saved = 0;
    let duplicates = 0;

    for (let pg = 1; pg <= pages; pg++) {
      const pageUrl = url.replace(/\/\d+$/, `/${pg}`);
      if (pg > 1) {
        await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        await page.waitForSelector('article', { timeout: 15000 }).catch(() => {});
        await new Promise(r => setTimeout(r, 5000));
>>>>>>> e77c36f (fix cloudflare bot defence - parsing works fine now)
      }

      const listAds = await page.evaluate((src) => {
        const articles = document.querySelectorAll('article');
        return [...articles].map(a => {
          const link = a.querySelector('a[href*="/oglas/"]');
          const nameEl = a.querySelector('[class*=name]');
          const cityEl = a.querySelector('[class*=originAndPromoLocation]');
          const priceEl = a.querySelector('[class*=inlinePrice], [class*=price]');
          const imgEl = a.querySelector('img[src*="kupujemprodajem"]');

          const title = nameEl?.textContent?.trim() || link?.getAttribute('aria-label') || null;
          const href = link?.getAttribute('href');
          const match = href?.match(/\/oglas\/(\d+)/);
          const id = match ? match[1] : null;

          return {
            id,
            source: src,
            url: href ? 'https://www.kupujemprodajem.com' + href : null,
            title,
            description: title,
            city: cityEl?.textContent?.trim() || null,
            price: priceEl?.textContent?.trim() || null,
            imgSrc: imgEl?.getAttribute('src') || null,
          };
        }).filter(a => a.id);
      }, source);

      for (const ad of listAds) {
        const description_hash = descriptionHash(ad.description, ad.title);
        let post = {
          id: ad.id,
          source: ad.source,
          url: ad.url,
          title: ad.title,
          description: ad.description,
          description_hash,
          city: ad.city,
          price: ad.price,
          images: ad.imgSrc ? JSON.stringify([ad.imgSrc]) : null,
          raw: JSON.stringify(ad),
        };

        if (fetchDetails && ad.url) {
          try {
            await page.goto(ad.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForSelector('h1', { timeout: 15000 }).catch(() => {});
            await new Promise(r => setTimeout(r, 5000));

            const detail = await page.evaluate((adId) => {
              const nextData = window.__NEXT_DATA__;
              const byId = nextData?.props?.initialReduxState?.ad?.byId ?? {};
              const d = byId[adId];

              if (d) return { type: 'nextData', detail: d };

              // DOM fallback
              const titleEl = document.querySelector('h1');
              const descEl = document.querySelector('[class*=description] p, [class*=adDescription]');
              const priceEl = document.querySelector('[class*=price]');
              const imgs = [...document.querySelectorAll('img[src*="kupujemprodajem"]')].map(i => i.src);

              return {
                type: 'dom',
                title: titleEl?.textContent?.trim(),
                description: descEl?.textContent?.trim(),
                price: priceEl?.textContent?.trim(),
                images: imgs,
              };
            }, ad.id);

            if (detail.type === 'nextData' && detail.detail) {
              const d = detail.detail;
              const desc = stripHtml(d.description);
              const images = [];
              if (d.image) images.push(d.image);
              if (Array.isArray(d.photos)) {
                for (const p of d.photos) {
                  if (p.original) images.push(p.original);
                  else if (p.thumbnail) images.push(p.thumbnail);
                }
              }
              if (d.photosBig) images.push(d.photosBig);

              post = {
                id: String(d.id),
                source,
                url: d.adUrl ? BASE_URL + d.adUrl : ad.url,
                title: d.name || ad.title,
                description: desc || ad.description,
                description_hash: descriptionHash(desc, d.name),
                city: d.location || ad.city,
                price: d.priceText || d.priceDisplay || ad.price,
                images: images.length ? JSON.stringify([...new Set(images)]) : post.images,
                raw: JSON.stringify(d),
              };
            } else if (detail.type === 'dom') {
              const desc = stripHtml(detail.description);
              post = {
                ...post,
                title: detail.title || post.title,
                description: desc || post.description,
                description_hash: descriptionHash(desc, detail.title),
                price: detail.price || post.price,
                images: detail.images?.length ? JSON.stringify(detail.images) : post.images,
              };
            }
            await new Promise(r => setTimeout(r, delayMs));
          } catch (err) {
            console.warn(`  [kupujemprodajem] detail fetch failed for ${ad.id}: ${err.message}; using list data`);
          }
        }

        const result = upsertPost(post);
        if (result.duplicate) duplicates++;
        else saved++;
      }
      console.log(`[kupujemprodajem] page ${pg}/${pages}: ${listAds.length} ads`);
    }

    console.log(`[kupujemprodajem] done. inserted/updated: ${saved}, duplicates skipped: ${duplicates}`);
    return { saved, duplicates, totalCount, totalPages, pages };
  } finally {
    await browser.close();
  }
}
