import express from "express";
import { fetchComments } from "../controllers/comments.controller.js";


const router=express.Router();

router.route("/:videoId").get(fetchComments);

export default router;