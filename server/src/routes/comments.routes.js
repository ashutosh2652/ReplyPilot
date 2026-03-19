import express from "express";
import { generateReplies, fetchComments } from "../controllers/comments.controller.js";


const router=express.Router();

router.post("/generate", generateReplies);
router.route("/:videoId").get(fetchComments);

export default router;