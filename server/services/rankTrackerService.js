// import { chromium } from "playwright-core";
// import Browserbase from "@browserbasehq/sdk";

// const bb = new Browserbase({
//     apiKey: process.env.BROWSERBASE_API_KEY,
// });

// // Search Google for a keyword and extract ranking results for a target domain.
// export async function rankTracker(keyword, targetDomain) {
//     let browser;
//     try {
//         // 1. Initialize Browserbase Session & Connect Playwright
//         const session = await bb.sessions.create({ browserSettings: { blockAds: true } });
//         browser = await chromium.connectOverCDP(session.connectUrl)
//         const page = browser.contexts()[0].pages()[0];
//         page.setDefaultNavigationTimeout(45000);

//         // 2. Initial Google Visit & Consent Handling
//         await page.goto("https://www.google.com", { waitUntil: "networkidle" });
//         try {
//             const btn = await page.$('button[id="L2AGLb"], form[action*="consent"] button')
//             if (btn) {
//                 await btn.click();
//                 await page.waitForTimeout(1500);
//             }
//         } catch { }

//         let found = null,
//             allResults = [];

//         const cleanTarget = targetDomain.replace("www.", "").toLowerCase();
//         // 3. Search Loop: Iterate through up to 5 pages of Google results
//         for (let gPage = 0; gPage < 5; gPage++) {
//             await page.goto(`https://www.google.com/search?q=${encodeURIComponent(keyword)}&start=${gPage * 10}&num=10&hl=en&gl=us`, { waitUntil: "networkidle" })

//             // 4. Page Extraction: Retry up to 3 times if results are missing
//             let pageResults = [];
//             for (let retry = 0; retry < 3; retry++) {
//                 try {
//                     await page.waitForSelector('h3', { timeout: 8000 });
//                     await page.waitForTimeout(1500)
//                     pageResults = await page.evaluate(() => Array.from(document.querySelectorAll("h3")).map((h3) => {
//                         let a = h3.closest('a');
//                         if (!a) {
//                             let p = h3.parentElement;
//                             for (let j = 0; j < 5 && p; j++, p = p.parentElement) {
//                                 if (p.tagName === "A") {
//                                     a = p;
//                                     break;
//                                 }
//                                 const sub = p.querySelector("a[href]");
//                                 if (sub && sub.contains(h3)) {
//                                     a = sub;
//                                     break;
//                                 }
//                             }
//                         }
//                         if (!a || !a.href.startsWith("http") || a.href.includes('google.')) return null;
//                         let s = "",
//                             c = a.parentElement;
//                         for (let j = 0; j < 6 &&  j++; c = c.parentElement) {
//                             const txt = c.innerText || "";
//                             if (txt.length > h3.innerText.length + 50) {
//                                 s = (txt.split("\n").find(
//                                     (l) => l.length > 30 && 
//                                     !l.includes(h3.innerText.substring(0, 20))) || "").trim().substring(0, 300);
//                                 if (s) break;
//                             }
//                         }
//                         return { url: a.href, domain: new URL(a.href).hostname.replace("www.", ""), title: h3.innerText.trim(), snippet: s }
//                     }).filter(Boolean)
//                     );
//                     if (pageResults.length > 0) break;
//                     await page.reload({ waitUntil: "networkidle" });
//                 } catch (err) {
//                     if (retry === 2) break;
//                     await page.reload({ waitUntil: "networkidle" })
//                 }
//             }
//             if (!pageResults.length) break;

//             // 5. Result Synthesis: Update global results and check for target match
//             for (const r of pageResults) {
//                 r.position = allResults.length + 1;
//                 allResults.push(r)
//                 if (!found && (r.domain.toLowerCase().includes(cleanTarget) || cleanTarget.includes(r.domain.toLowerCase()))) {
//                     found = { ...r, page: gPage + 1 }
//                 }
//             }
//             if (found) break;
//             await page.waitForTimeout(2000 + Math.random() * 2000);
//         }

//         // 6. Finalization: Close browser and extract competitors
//         await browser.close();
//         const competitors = allResults.filter((r) => !r.domain.toLowerCase().includes(cleanTarget) &&
//             !cleanTarget.includes(r.domain.toLowerCase())).slice(0, 10);

//         return {
//             success: true,
//             data: {
//                 keyword,
//                 targetDomain,
//                 position: found?.position || null,
//                 page: found?.page || null,
//                 title: found?.title || "",
//                 snippet: found?.snippet || "",
//                 competitors,
//                 totalResultsScanned: allResults.length
//             }
//         }

//     } catch (error) {
//         console.error("Rank check error:", error.message);
//         if (browser) await browser.close().catch(() => { })
//         return { success: false, error: error.message }
//     }
// }






import { chromium } from "playwright-core";
import Browserbase from "@browserbasehq/sdk";

const bb = new Browserbase({
    apiKey: process.env.BROWSERBASE_API_KEY,
});

// Normalize domain names.
function cleanDomain(domain) {
    return domain
        .replace(/^https?:\/\//i, "")
        .replace(/^www\./i, "")
        .split("/")[0]
        .split("?")[0]
        .toLowerCase()
        .trim();
}

// Check whether a hostname belongs to Google.
function isGoogleDomain(hostname) {
    return (
        hostname === "google.com" ||
        hostname.endsWith(".google.com") ||
        hostname === "googleusercontent.com" ||
        hostname.endsWith(".googleusercontent.com")
    );
}

// Resolve Google's redirect URL.
async function resolveGoogleRedirect(context, href) {
    const absoluteUrl = new URL(
        href,
        "https://www.google.com"
    ).href;

    // First attempt: follow HTTP redirects.
    try {
        const response = await context.request.get(absoluteUrl, {
            timeout: 20000,
            maxRedirects: 5,
        });

        const finalUrl = response.url();

        const parsed = new URL(finalUrl);

        if (
            ["http:", "https:"].includes(parsed.protocol) &&
            !isGoogleDomain(parsed.hostname)
        ) {
            return finalUrl;
        }
    } catch (error) {
        console.log(
            "HTTP redirect resolution failed:",
            error.message
        );
    }

    // Second attempt: resolve through a browser page.
    let redirectPage;

    try {
        redirectPage = await context.newPage();

        await redirectPage.goto(absoluteUrl, {
            waitUntil: "commit",
            timeout: 25000,
        });

        const finalUrl = redirectPage.url();
        const parsed = new URL(finalUrl);

        if (
            ["http:", "https:"].includes(parsed.protocol) &&
            !isGoogleDomain(parsed.hostname)
        ) {
            return finalUrl;
        }

    } catch (error) {
        console.log(
            "Browser redirect resolution failed:",
            error.message
        );
    } finally {
        if (redirectPage) {
            await redirectPage.close().catch(() => {});
        }
    }

    return null;
}

// Main rank tracking function.
export async function rankTracker(keyword, targetDomain) {
    let browser;

    try {
        // Validate inputs.
        if (!process.env.BROWSERBASE_API_KEY) {
            throw new Error(
                "BROWSERBASE_API_KEY is missing in .env"
            );
        }

        if (!keyword || !targetDomain) {
            throw new Error(
                "Keyword and target domain are required."
            );
        }

        const cleanTarget = cleanDomain(targetDomain);

        if (!cleanTarget) {
            throw new Error("Invalid target domain.");
        }

        console.log("Creating Browserbase session...");

        // 1. Create Browserbase session.
        const session = await bb.sessions.create({
            browserSettings: {
                blockAds: true,
            },
        });

        console.log("Browserbase session created.");

        // 2. Connect Playwright.
        browser = await chromium.connectOverCDP(
            session.connectUrl
        );

        const context = browser.contexts()[0];

        const page = context.pages()[0] ||
            await context.newPage();

        page.setDefaultNavigationTimeout(60000);

        // 3. Open Google.
        await page.goto("https://www.google.com", {
            waitUntil: "domcontentloaded",
            timeout: 60000,
        });

        // Handle consent popup.
        try {
            const consentButton = page.locator(
                'button[id="L2AGLb"], form[action*="consent"] button'
            ).first();

            if (
                await consentButton.isVisible().catch(() => false)
            ) {
                await consentButton.click();
                await page.waitForTimeout(1500);
            }
        } catch (error) {
            console.log("Consent handling:", error.message);
        }

        let found = null;

        const allResults = [];
        const seenUrls = new Set();

        // 4. Search up to 5 Google pages.
        for (let gPage = 0; gPage < 5; gPage++) {

            const searchUrl =
                `https://www.google.com/search?q=${encodeURIComponent(keyword)}` +
                `&start=${gPage * 10}&num=10&hl=en&gl=us`;

            console.log(
                `Checking Google page ${gPage + 1}`
            );

            await page.goto(searchUrl, {
                waitUntil: "domcontentloaded",
                timeout: 60000,
            });

            await page.waitForTimeout(3000);

            const pageTitle = await page.title();

            const pageText = await page
                .locator("body")
                .innerText()
                .catch(() => "");

            console.log("Google Title:", pageTitle);

            // Detect blocking.
            if (
                /unusual traffic|not a robot|automated queries|captcha/i.test(
                    pageText
                )
            ) {
                throw new Error(
                    "Google blocked the search request or returned a CAPTCHA."
                );
            }

            // 5. Extract actual organic result headings.
            const candidates = await page.evaluate(() => {

                const headings = Array.from(
                    document.querySelectorAll("h3.LC20lb")
                );

                return headings.map(h3 => {

                    const anchor = h3.closest("a");

                    if (!anchor) return null;

                    // Find result container for snippet.
                    const container =
                        h3.closest(".MjjYud") ||
                        anchor.parentElement?.parentElement;

                    return {
                        title: h3.innerText.trim(),
                        href: anchor.getAttribute("href"),
                        snippet: (
                            container?.innerText || ""
                        ).trim().substring(0, 300),
                    };

                }).filter(item => item && item.href);
            });

            console.log(
                "Organic headings found:",
                candidates.length
            );

            // 6. Resolve Google redirect URLs.
            const pageResults = [];

            for (const candidate of candidates) {

                const actualUrl = await resolveGoogleRedirect(
                    context,
                    candidate.href
                );

                if (!actualUrl) {
                    console.log(
                        "Could not resolve:",
                        candidate.title
                    );

                    continue;
                }

                try {
                    const parsedUrl = new URL(actualUrl);

                    const domain = parsedUrl.hostname
                        .replace(/^www\./i, "")
                        .toLowerCase();

                    if (isGoogleDomain(domain)) {
                        continue;
                    }

                    if (seenUrls.has(actualUrl)) {
                        continue;
                    }

                    seenUrls.add(actualUrl);

                    pageResults.push({
                        url: actualUrl,
                        domain,
                        title: candidate.title,
                        snippet: candidate.snippet,
                    });

                    console.log(
                        "Resolved:",
                        candidate.title,
                        "=>",
                        domain
                    );

                } catch {
                    continue;
                }
            }

            console.log(
                `Resolved results on page ${gPage + 1}:`,
                pageResults.length
            );

            // Stop if no destinations could be resolved.
            if (!pageResults.length) {
                console.log(
                    "No resolvable organic results found."
                );

                break;
            }

            // 7. Calculate ranking positions.
            for (const result of pageResults) {

                result.position = allResults.length + 1;

                allResults.push(result);

                const isTarget =
                    result.domain === cleanTarget ||
                    result.domain.endsWith("." + cleanTarget);

                if (!found && isTarget) {
                    found = {
                        ...result,
                        page: gPage + 1,
                    };
                }
            }

            if (found) {
                break;
            }

            await page.waitForTimeout(1500);
        }

        // 8. Extract competitors.
        const competitors = allResults
            .filter(result => {
                return (
                    result.domain !== cleanTarget &&
                    !result.domain.endsWith("." + cleanTarget)
                );
            })
            .slice(0, 10);

        console.log("--------------------------------");
        console.log("Keyword:", keyword);
        console.log("Target:", cleanTarget);
        console.log(
            "Position:",
            found?.position || "Not found"
        );
        console.log(
            "Total results:",
            allResults.length
        );
        console.log("--------------------------------");

        // 9. Return results.
        return {
            success: true,

            data: {
                keyword,
                targetDomain,

                position: found?.position || null,
                page: found?.page || null,

                title: found?.title || "",
                snippet: found?.snippet || "",

                competitors,

                totalResultsScanned: allResults.length,
            },
        };

    } catch (error) {

        console.error(
            "Rank check error:",
            error.message
        );

        return {
            success: false,
            error: error.message,
        };

    } finally {

        // 10. Close browser.
        if (browser) {
            await browser.close().catch(() => {});
        }
    }
}



