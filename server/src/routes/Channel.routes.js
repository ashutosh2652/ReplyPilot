import express from 'express';

import {
  fetchChannel,
  getChannelDetails,
  getChannelVideos,
  getVideoDetails,
  getVideoComments,
} from '../controllers/Channel.controller.js';

const router = express.Router();

router.get('/channel', fetchChannel);

router.get('/channel/:channelId', getChannelDetails);
router.get('/channel/:channelId/videos', getChannelVideos);
router.get('/video/:videoId', getVideoDetails);
router.get('/video/:videoId/comments', getVideoComments);


export default router;
