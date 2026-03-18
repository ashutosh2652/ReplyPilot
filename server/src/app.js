import express from "express";

const app=express();

app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ limit: "16kb", extended: true }));
app.use(express.static("public"));

import authRoute from "./routes/auth.routes.js";
app.use("/api/auth/google", authRoute);

import youtubeRoute from "./routes/youtube.routes.js";
app.use("/api/youtube",youtubeRoute);

import commentRoute from "./routes/comments.routes.js";
app.use("/api/comment",commentRoute);


export default app;