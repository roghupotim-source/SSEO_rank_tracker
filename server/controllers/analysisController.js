
import Analysis from "../models/Analysis.js";
import { analyzeSeoData } from "../services/geminiService.js";
import { scrapeUrl } from "../services/scraperService.js";

// NEW: Run scraping and AI analysis in the background
const runAnalysisInBackground = async (analysis) => {
    try {
        // Step 1: Scrape website
        console.log("Starting website scraping:", analysis.url);

        const scrapeResult = await scrapeUrl(analysis.url);

        if (!scrapeResult.success) {
            console.error("Website scraping failed:", scrapeResult.error);

            analysis.status = "failed";
            await analysis.save();
            return;
        }

        // Step 2: Analyze website using Gemini
        console.log("Starting Gemini SEO analysis...");

        const aiResult = await analyzeSeoData(scrapeResult.data);

        if (!aiResult.success) {
            console.error("Gemini SEO analysis failed:", aiResult.error);

            analysis.status = "failed";
            await analysis.save();
            return;
        }

        // Step 3: Save analysis results
        analysis.overallScore = aiResult.data.overallScore || 0;
        analysis.categories = aiResult.data.categories || {};

        analysis.metaData = scrapeResult.data.metaData || {};
        analysis.headings = scrapeResult.data.headings || {};
        analysis.links = scrapeResult.data.links || {};
        analysis.images = scrapeResult.data.images || {};

        analysis.keywords = aiResult.data.keywords || [];
        analysis.issues = aiResult.data.issues || [];

        analysis.loadTime = scrapeResult.data.loadTime || 0;
        analysis.pageSize = scrapeResult.data.pageSize || 0;
        analysis.wordCount = scrapeResult.data.wordCount || 0;

        analysis.status = "completed";

        await analysis.save();

        console.log("SEO analysis completed successfully:", analysis._id);

    } catch (error) {
        console.error("Background analysis error:", error.message);

        try {
            analysis.status = "failed";
            await analysis.save();
        } catch (saveError) {
            console.error("Failed to save failed status:", saveError.message);
        }
    }
};


// Analyze a URL
export const analyzeUrl = async (req, res) => {
    try {
        const { url } = req.body;

        if (!url || typeof url !== "string") {
            return res.status(400).json({
                success: false,
                message: "URL is required",
            });
        }

        // Validate URL format
        let validUrl;

        try {
            validUrl = new URL(
                url.startsWith("http") ? url : `https://${url}`
            );
        } catch (error) {
            return res.status(400).json({
                success: false,
                message: "Invalid URL format",
            });
        }

        // Create analysis record
        const analysis = await Analysis.create({
            userId: req.userId,
            url: validUrl.href,
            status: "processing",
        });

        // Send immediate response
        res.json({
            success: true,
            message: "Analysis started",
            analysisId: analysis._id,
        });

        // NEW: Start background task without blocking the response
        runAnalysisInBackground(analysis).catch((error) => {
            console.error("Unexpected background error:", error.message);
        });

    } catch (error) {
        console.error("Analyze URL error:", error.message);

        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: "Server error",
            });
        }
    }
};


// Get analysis by ID
export const getAnalysis = async (req, res) => {
    try {
        const analysis = await Analysis.findOne({
            _id: req.params.id,
            userId: req.userId,
        });

        if (!analysis) {
            return res.status(404).json({
                success: false,
                message: "Analysis not found",
            });
        }

        res.json({
            success: true,
            analysis,
        });

    } catch (error) {
        console.error("Get analysis error:", error.message);

        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};


// Get all analyses for user
export const getAnalyses = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;

        const analyses = await Analysis.find({
            userId: req.userId,
        })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .select("-issues -keywords");

        const total = await Analysis.countDocuments({
            userId: req.userId,
        });

        res.json({
            success: true,
            analyses,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        });

    } catch (error) {
        console.error("Get analyses error:", error.message);

        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};


// Delete analysis
export const deleteAnalysis = async (req, res) => {
    try {
        // FIXED: Use findOneAndDelete to check both ID and user ownership
        const analysis = await Analysis.findOneAndDelete({
            _id: req.params.id,
            userId: req.userId,
        });

        if (!analysis) {
            return res.status(404).json({
                success: false,
                message: "Analysis not found",
            });
        }

        res.json({
            success: true,
            message: "Analysis deleted",
        });

    } catch (error) {
        console.error("Delete analysis error:", error.message);

        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};
