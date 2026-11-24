
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
});

// SEO analysis response structure
const seoAnalysisSchema = {
    type: Type.OBJECT,
    properties: {
        overallScore: { type: Type.INTEGER },
        categories: {
            type: Type.OBJECT,
            properties: {
                seo: { type: Type.INTEGER },
                performance: { type: Type.INTEGER },
                accessibility: { type: Type.INTEGER },
                bestPractices: { type: Type.INTEGER },
            },
            required: ["seo", "performance", "accessibility", "bestPractices"],
        },
        keywords: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    word: { type: Type.STRING },
                    count: { type: Type.INTEGER },
                    density: { type: Type.NUMBER },
                },
                required: ["word", "count", "density"],
            },
        },
        issues: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    severity: {
                        type: Type.STRING,
                        enum: ["critical", "warning", "info"],
                    },
                    category: { type: Type.STRING },
                    message: { type: Type.STRING },
                    recommendation: { type: Type.STRING },
                },
                required: ["severity", "category", "message", "recommendation"],
            },
        },
    },
    required: ["overallScore", "categories", "keywords", "issues"],
};

// NEW: Wait helper for retry mechanism
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// NEW: Identify temporary Gemini errors
const isRetryableError = (error) => {
    const status = Number(error?.status || error?.code);

    return [408, 429, 500, 502, 503, 504].includes(status) ||
        /UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand/i.test(
            error?.message || ""
        );
};

export async function analyzeSeoData(scrapedData) {
    try {
        const prompt = `You are an expert SEO analyst. Analyze the following website data and provide a comprehensive SEO audit.

Website URL: ${scrapedData.url}
Load Time: ${scrapedData.loadTime}ms
Status Code: ${scrapedData.statusCode}
Page Size: ${Math.round(scrapedData.pageSize / 1024)}KB
Word Count: ${scrapedData.wordCount}

META DATA:
- Title: "${scrapedData.metaData.title}" (${scrapedData.metaData.title.length} chars)
- Description: "${scrapedData.metaData.description}" (${scrapedData.metaData.description.length} chars)
- Canonical: "${scrapedData.metaData.canonical}"
- Robots: "${scrapedData.metaData.robots}"
- OG Title: "${scrapedData.metaData.ogTitle}"
- OG Description: "${scrapedData.metaData.ogDescription}"
- OG Image: "${scrapedData.metaData.ogImage}"
- Twitter Card: "${scrapedData.metaData.twitterCard}"
- Viewport: "${scrapedData.metaData.viewport}"
- Charset: "${scrapedData.metaData.charset}"

HEADINGS:
- H1: ${scrapedData.headings.h1} (texts: ${JSON.stringify(scrapedData.headings.h1Texts)})
- H2: ${scrapedData.headings.h2}
- H3: ${scrapedData.headings.h3}
- H4: ${scrapedData.headings.h4}
- H5: ${scrapedData.headings.h5}
- H6: ${scrapedData.headings.h6}

LINKS:
- Internal: ${scrapedData.links.internal}
- External: ${scrapedData.links.external}
- Total: ${scrapedData.links.total}

IMAGES:
- Total: ${scrapedData.images.total}
- Missing Alt Text: ${scrapedData.images.missingAlt}
- With Alt Text: ${scrapedData.images.withAlt}

PAGE CONTENT (first 3000 chars):
${scrapedData.bodyText}

Scoring guidelines:
- Title: 50-60 chars optimal, must exist
- Description: 150-160 chars optimal, must exist
- H1: exactly 1 is ideal
- Images: all should have alt text
- Load time: <3s good, <5s ok, >5s poor
- Page size: <3MB good
- Must have viewport meta, charset, canonical
- OG tags and Twitter cards are important
- Internal linking is good for SEO
- Word count: >300 words for content pages
- Check heading hierarchy

Severity levels must be exactly one of: "critical", "warning", or "info".
Provide 5-15 issues sorted by severity (critical first). Be specific and actionable with recommendations.
Extract top 10 keywords by frequency from the page content.`;

        // NEW: Maximum 4 attempts (1 original + 3 retries)
        const maxAttempts = 4;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                console.log(`Gemini analysis attempt ${attempt}/${maxAttempts}`);

                const response = await ai.models.generateContent({
                    // Keep your existing model to avoid unnecessary changes
                    model: "gemma-4-31b-it",
                    contents: [
                        {
                            role: "user",
                            parts: [{ text: prompt }],
                        },
                    ],
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: seoAnalysisSchema,
                    },
                });

                // Validate response
                if (!response.text) {
                    throw new Error("Gemini returned an empty response");
                }

                const analysis = JSON.parse(response.text);

                console.log("Gemini SEO analysis completed successfully");

                return {
                    success: true,
                    data: analysis,
                };

            } catch (error) {
                console.error(
                    `Gemini attempt ${attempt} failed:`,
                    error.message
                );

                // Stop immediately for non-temporary errors
                if (!isRetryableError(error)) {
                    throw error;
                }

                // Stop if maximum attempts reached
                if (attempt === maxAttempts) {
                    throw error;
                }

                // Exponential backoff with random jitter
                const delay = Math.min(
                    1500 * Math.pow(2, attempt - 1) + Math.random() * 1000,
                    15000
                );

                console.log(
                    `Gemini temporarily unavailable. Retrying in ${Math.round(delay)}ms...`
                );

                await sleep(delay);
            }
        }

    } catch (error) {
        console.error("Gemini analysis error:", error.message);

        return {
            success: false,
            error: error.message,
        };
    }
}
