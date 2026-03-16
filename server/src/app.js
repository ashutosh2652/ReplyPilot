import express from "express";
import youtubeRoutes from "./routes/youtube.routes.js";

import commentRoutes from "./routes/comments.routes.js"
const app = express();

app.use(express.json());

app.use("/auth/google", youtubeRoutes);

app.use("/api/comments", commentRoutes)

export default app;