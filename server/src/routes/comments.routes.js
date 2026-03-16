import express from "express";

const router = express.Router()

import { generateReplies} from "../controllers/comments.controller.js"

router.post("/generate", generateReplies)

export default router;