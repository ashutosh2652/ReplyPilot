import { getVideoComments } from "../services/comment.service.js";

export const fetchComments = async (req, res) => {

  try {

    const { videoId } = req.params;

    const data = await getVideoComments(videoId);

    res.json(data);

  } catch (error) {

    res.status(500).json(error);

  }

};