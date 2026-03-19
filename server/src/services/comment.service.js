import { google } from "googleapis";
import oauth2Client from "../config/googleOAuth.js";


export const getVideoComments = async (videoId) => {

  const youtube = google.youtube({
    version: "v3",
    auth: oauth2Client
  });

  const response = await youtube.commentThreads.list({
    part: "snippet",
    videoId: videoId,
    maxResults: 20
  });

  return response.data;

};