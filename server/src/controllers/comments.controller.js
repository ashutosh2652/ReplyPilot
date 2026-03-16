import { generateRepliesBatch } from "../services/aiService.js";

export async function generateReplies(req, res) {
    const { comments } = req.body;

    try {
        const results = await generateRepliesBatch(comments);
        res.json(results);
    } catch (err) {
        console.error("Error contacting FastAPI:", err.message);
        res.status(500).json({ error: "Failed to generate replies" });
    }
}