import express from "express";
import { googleCallback, googleLogin } from "../controllers/auth.controller.js";


const router = express.Router();

router.route("/login").get(googleLogin);
router.route("/callback").get(googleCallback);

export default router;