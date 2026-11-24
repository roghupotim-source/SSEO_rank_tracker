
import { chromium } from "playwright-core";
import Browserbase from "@browserbasehq/sdk";

const bb = new Browserbase({
    apiKey: process.env.BROWSERBASE_API_KEY,
});

export async function scrapeUrl(url) {
    let browser = null;
    let page = null;

    try {
        // Step 1: Create Browserbase session
        console.log("[SCRAPER] Creating Browserbase session...");

        const session = await bb.sessions.create({
            browserSettings: {
                blockAds: true,
            },
        });

        if (!session?.connectUrl) {
            throw new Error("Browserbase did not return a connection URL");
        }

        // Step 2: Connect Playwright to Browserbase
        console.log("[SCRAPER] Connecting to Browserbase...");

        browser = await chromium.connectOverCDP(session.connectUrl, {
            timeout: 30000,
        });

        // Step 3: Get browser context and page
        const contexts = browser.contexts();

        const context = contexts.length > 0
            ? contexts[0]
            : await browser.newContext();

        const pages = context.pages();

        page = pages.length > 0
            ? pages[0]
            : await context.newPage();

        page.setDefaultNavigationTimeout(30000);

        // Step 4: Navigate to website
        console.log("[SCRAPER] Opening website:", url);

        const startTime = Date.now();

        const response = await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: 30000,
        });

        const loadTime = Date.now() - startTime;

        // Allow page content to render
        await page.waitForTimeout(2000);

        // Step 5: Extract SEO data
        const scrapedData = await page.evaluate(() => {

            const getMeta = (name) => {
                const el =
                    document.querySelector(`meta[name="${name}"]`) ||
                    document.querySelector(`meta[property="${name}"]`);

                return el
                    ? el.getAttribute("content") || ""
                    : "";
            };

            const title = document.title || "";
            const description = getMeta("description");

            const canonical =
                document.querySelector('link[rel="canonical"]')?.href || "";

            const robots = getMeta("robots");
            const ogTitle = getMeta("og:title");
            const ogDescription = getMeta("og:description");
            const ogImage = getMeta("og:image");
            const twitterCard = getMeta("twitter:card");
            const viewport = getMeta("viewport");

            const charsetMeta = document.querySelector("meta[charset]");

            const charset = charsetMeta
                ? charsetMeta.getAttribute("charset") || ""
                : "";

            // Extract headings
            const h1Elements = document.querySelectorAll("h1");

            const h1Texts = Array.from(h1Elements).map(
                (el) => el.textContent?.trim() || ""
            );

            const headings = {
                h1: document.querySelectorAll("h1").length,
                h2: document.querySelectorAll("h2").length,
                h3: document.querySelectorAll("h3").length,
                h4: document.querySelectorAll("h4").length,
                h5: document.querySelectorAll("h5").length,
                h6: document.querySelectorAll("h6").length,
                h1Texts,
            };

            // Extract links
            const allLinks = Array.from(
                document.querySelectorAll("a[href]")
            );

            const currentHost = window.location.hostname;

            let internalLinks = 0;
            let externalLinks = 0;

            allLinks.forEach((link) => {
                try {
                    const href = link.href;

                    if (
                        href.startsWith("mailto:") ||
                        href.startsWith("tel:")
                    ) {
                        return;
                    }

                    const linkUrl = new URL(href);

                    if (linkUrl.hostname === currentHost) {
                        internalLinks++;
                    } else {
                        externalLinks++;
                    }
                } catch {
                    // Ignore invalid links
                }
            });

            // Extract images
            const allImages = Array.from(
                document.querySelectorAll("img")
            );

            const missingAlt = allImages.filter(
                (img) => !img.alt || img.alt.trim() === ""
            ).length;

            // Extract page content
            const bodyText = document.body?.innerText || "";

            const wordCount = bodyText
                .split(/\s+/)
                .filter((word) => word.length > 0).length;

            const pageSize = document.documentElement.outerHTML.length;

            return {
                metaData: {
                    title,
                    description,
                    canonical,
                    robots,
                    ogTitle,
                    ogDescription,
                    ogImage,
                    twitterCard,
                    viewport,
                    charset,
                },

                headings,

                links: {
                    internal: internalLinks,
                    external: externalLinks,
                    total: allLinks.length,
                },

                images: {
                    total: allImages.length,
                    missingAlt,
                    withAlt: allImages.length - missingAlt,
                },

                wordCount,
                pageSize,

                bodyText: bodyText.substring(0, 3000),
            };
        });

        // Step 6: Get HTTP status code
        const statusCode = response?.status() || 0;

        console.log("[SCRAPER] Website scraped successfully:", url);

        // Step 7: Return successful result
        return {
            success: true,

            data: {
                ...scrapedData,
                loadTime,
                statusCode,
                url,
            },
        };

    } catch (error) {

        // FIX: Always return a failure object instead of undefined
        console.error(
            "[SCRAPER] Playwright session failed:",
            error.message
        );

        return {
            success: false,
            error: error.message || "Website scraping failed",
        };

    } finally {

        // FIX: Always attempt to close the browser
        if (browser) {
            try {
                await browser.close();
                console.log("[SCRAPER] Browser connection closed");
            } catch (closeError) {
                console.error(
                    "[SCRAPER] Browser close failed:",
                    closeError.message
                );
            }
        }
    }
}
