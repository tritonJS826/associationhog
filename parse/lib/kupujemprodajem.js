import { upsertPost } from './db.js';

const BASE_URL = 'https://www.kupujemprodajem.com';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function extractPageInfo() {
  const paginationLinks = document.querySelectorAll('a[href*="/grupa/"]');
  const pageNums = [...paginationLinks]
    .map(a => a.textContent?.trim())
    .filter(t => /^\d+$/.test(t))
    .map(Number);
  const maxPage = pageNums.length ? Math.max(...pageNums) : 1;

  // Total count - look for text like "957 rezultata"
  const totalText = document.body?.innerText?.match(/(\d[\d.]*)\s*oglas/);
  const total = totalText ? parseInt(totalText[1].replace(/\./g, ''), 10) : 0;

  return { maxPage, total };
}

function extractListAds(source) {
  const articles = [...document.querySelectorAll('article')];
  const ads = articles
    .map(a => {
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
        source,
        url: href ? 'https://www.kupujemprodajem.com' + href : null,
        title,
        description: title,
        city: cityEl?.textContent?.trim() || null,
        price: priceEl?.textContent?.trim() || null,
        imgSrc: imgEl?.getAttribute('src') || null,
      };
    })
    .filter(a => a.id);

  const challenge =
    /just a moment/i.test(document.title) ||
    !!document.querySelector('iframe[src*="recaptcha"], .g-recaptcha, #header-captcha-id');

  return { ads, articleCount: articles.length, challenge };
}

export async function scrapeKupujemProdajem({
  url,
  source = 'kupujemprodajem',
  maxPages = Infinity,
  delayMs = 8000,
  retries = 3,
} = {}) {
  const puppeteerExtra = (await import('puppeteer-extra')).default;
  const { default: StealthPlugin } = await import('puppeteer-extra-plugin-stealth');
  puppeteerExtra.use(StealthPlugin());

  const browser = await puppeteerExtra.launch({ headless: true, args: ['--no-sandbox'] });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // Rate limiter: enforce a minimum gap between successive navigations so the
    // site's anti-bot doesn't kick in and start serving skeleton-only pages.
    let lastNav = 0;
    const pause = async () => {
      const gap = delayMs - (Date.now() - lastNav);
      if (gap > 0) await sleep(gap);
      lastNav = Date.now();
    };

    const loadList = async (pageUrl) => {
      for (let attempt = 1; attempt <= retries; attempt++) {
        await pause();
        await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        await page.waitForSelector('article', { timeout: 20000 }).catch(() => {});
        // Give client-side JS time to replace skeleton placeholders with real ads.
        await sleep(4000);

        const { ads, articleCount, challenge } = await page.evaluate(extractListAds, source);
        if (ads.length > 0) return ads;

        // articles present but no usable ads == soft-block skeleton / captcha.
        const backoff = delayMs * 2 ** attempt;
        console.warn(
          `  [kupujemprodajem] ${pageUrl}: 0 ads (articles=${articleCount}, challenge=${challenge}) - blocked, retry ${attempt}/${retries} in ${Math.round(backoff / 1000)}s`
        );
        if (attempt === retries) {
          throw new Error(`kupujemprodajem returned no ads for ${pageUrl} after ${retries} attempts (soft-blocked)`);
        }
        await sleep(backoff);
      }
    };

    const firstAds = await loadList(url);

    const pageInfo = await page.evaluate(extractPageInfo);
    const totalPages = pageInfo.maxPage || 1;
    const totalCount = pageInfo.total || 0;
    const pages = Math.min(totalPages, maxPages === Infinity ? totalPages : maxPages);

    console.log(`[kupujemprodajem] source: ${source}`);
    console.log(`[kupujemprodajem] total ads: ${totalCount}, pages: ${totalPages}, fetching: ${pages}, delay: ${delayMs}ms`);

    let saved = 0;
    let duplicates = 0;

    for (let pg = 1; pg <= pages; pg++) {
      let listAds;
      if (pg === 1) {
        listAds = firstAds;
      } else {
        const pageUrl = url.replace(/\/\d+$/, `/${pg}`);
        listAds = await loadList(pageUrl);
      }

      for (const ad of listAds) {
        const post = {
          id: ad.id,
          source: ad.source,
          url: ad.url,
          title: ad.title,
          description: ad.description,
          city: ad.city,
          price: ad.price,
          images: JSON.stringify(ad.imgSrc ? [ad.imgSrc] : []),
          raw: JSON.stringify(ad),
        };

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