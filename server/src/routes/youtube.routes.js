import express from "express";

import {
  fetchChannel,
} from "../controllers/youtube.controller.js";

const router = express.Router();

router.get("/channel", fetchChannel);


export default router;