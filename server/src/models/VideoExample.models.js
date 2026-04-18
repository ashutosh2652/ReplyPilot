import mongoose from "mongoose";

const VideoExampleSchema = new mongoose.Schema(
    {
        videoId: {
            type: String,
            required: true,
            index: true,
        },
        commentText: { type: String, required: true },
        replyText: { type: String, required: true },
        scores: {
            question: { type: Number, default: 0, min: 0, max: 1 },
            praise: { type: Number, default: 0, min: 0, max: 1 },
            critism: { type: Number, default: 0, min: 0, max: 1 },
            neutral: { type: Number, default: 0, min: 0, max: 1 },
            spam: { type: Number, default: 0, min: 0, max: 1 },
        },
    },
    { timestamps: true },
);

// Prevent duplicate comment-reply pairs per video
VideoExampleSchema.index(
    { videoId: 1, commentText: 1, replyText: 1 },
    { unique: true }
);

export default mongoose.model("VideoExample", VideoExampleSchema);
