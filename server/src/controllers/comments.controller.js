import { generateRepliesBatch } from "../services/aiService.js";
import { getVideoComments } from "../services/comment.service.js";

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

export const fetchComments = async (req, res) => {

  try {

    const { videoId } = req.params;

    const data = await getVideoComments(videoId);

    res.json(data);

  } catch (error) {

    res.status(500).json(error);

  }

};