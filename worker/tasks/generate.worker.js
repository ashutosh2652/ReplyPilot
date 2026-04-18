import { Worker } from 'bullmq';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { bullConnection } from '../config/redis.js';
import Comment from '../models/Comment.models.js';
import Reply from '../models/Reply.models.js';
import Persona from '../models/Persona.models.js';
import PersonaExample from '../models/PersonaExample.models.js';
import Video from '../models/Video.models.js';
import httpClient from '../utils/httpClient.js';
import logger from '../utils/logger.js';


import axios from 'axios';

/**
 * Fetch the top matching PersonaExamples using the server's API via cosine similarity
 * on the multi-label intent scores.
 */
async function fetchFewShotExamples(personaId, intents = [], limit = 4) {
  if (!personaId || !intents.length) return [];

  try {
    // Build the scores vector [question, praise, critism, neutral, spam]
    const scoresMap = { question: 0, praise: 0, critism: 0, neutral: 0, spam: 0 };
    for (const intent of intents) {
      const label = intent.label?.toLowerCase();
      if (label === 'criticism') scoresMap.critism = intent.confidence;
      else if (scoresMap[label] !== undefined) scoresMap[label] = intent.confidence;
    }

    const scoresArray = [
      scoresMap.question,
      scoresMap.praise,
      scoresMap.critism,
      scoresMap.neutral,
      scoresMap.spam,
    ];

    if (scoresArray.every(s => s === 0)) return [];

    const response = await axios.post(`http://localhost:5000/api/personas/${personaId}/similar-examples`, {
      scores: scoresArray
    });

    const results = response.data?.data || [];
    return results.slice(0, limit).map(r => ({
      comment_text: r.commentText,
      reply_text: r.replyText,
    }));
  } catch (err) {
    logger.error(`Failed to fetch few-shot examples via API for persona ${personaId}:`, err.message);
    return [];
  }
}


export const generateWorker = new Worker(
  'generate',
  async (job) => {
    const {
      commentId,
      tone,
      personaId,
      videoId,
      language,
      isEnglish,
      intents = [],
    } = job.data;
    let createdReplyId = null;

    try {
      const comment = await Comment.findById(commentId);
      if (!comment) {
        throw new Error(`Comment not found for id: ${commentId}`);
      }

      // 2. Fetch the persona (if provided)
      let creatorBio = '';
      let effectivePersonaId = personaId;
      if (personaId) {
        const persona = await Persona.findById(personaId);
        if (persona) {
          creatorBio = persona.creatorBio || persona.description || '';
        }
      }

      // 3. Build basic video context (title + description)
      let videoContext = '';
      const vid = await Video.findOne({ videoId: videoId || comment.videoId }).lean();
      if (vid) {
        videoContext = `Title: ${vid.title || 'N/A'}. Description: ${(vid.description || '').slice(0, 500)}`;
      }

      // 4. Fetch few-shot persona examples via cosine similarity
      // Use the intents from classification (passed via job data)
      const commentIntents = intents.length > 0
        ? intents
        : (comment.intents || []).map(i => ({ label: i.label, confidence: i.confidence }));

      const fewShotExamples = await fetchFewShotExamples(
        effectivePersonaId,
        commentIntents,
      );

      // 5. Call AI Service to generate a reply (enriched payload)
      const aiResponse = await httpClient.post('/api/v1/generate', {
        comment_id: commentId,
        comment_text: comment.textDisplay || comment.text,
        tone: tone || 'friendly',
        persona_id: effectivePersonaId || null,
        video_context: videoContext,
        video_id: videoId || comment.videoId,
        intents: commentIntents,
        is_english: isEnglish !== undefined ? isEnglish : true,
        creator_bio: creatorBio || null,
        few_shot_examples: fewShotExamples.length > 0 ? fewShotExamples : null,
      });

      const generatedText = aiResponse.data.reply_text;
      if (!generatedText) {
        throw new Error('AI Service did not return reply_text');
      }

      // 6. Handle [SPAM_DETECTED] sentinel from non-English spam
      if (generatedText === '[SPAM_DETECTED]') {
        logger.info(`Non-English spam detected by Gemma for comment ${commentId}`);
        comment.isSpam = true;
        await comment.save();
        return { success: true, spamDetected: true };
      }

      // 7. Create or update the Reply document
      const reply = await Reply.findOneAndUpdate(
        { commentId: comment._id },
        {
          commentId: comment._id,
          ytCommentId: comment.ytCommentId,
          personaId: effectivePersonaId || undefined,
          generatedText,
          tone: aiResponse.data.tone || tone || 'friendly',
          status: 'pending_review',
        },
        { upsert: true, new: true }
      );

      createdReplyId = reply._id;

      logger.info(`Generate Job ${job.id} completed for comment ${commentId}`);
      return { success: true, replyId: reply._id };

    } catch (error) {
      logger.error(`Generate Job ${job.id} failed:`, error.message);
      
      if (createdReplyId) {
          await Reply.findByIdAndUpdate(createdReplyId, { status: 'failed' }).catch((err) => logger.error(`Failed to update reply ${createdReplyId} status: ${err.message}`));
      }

      throw error; // Let BullMQ handle retries
    }
  },
  {
    connection: bullConnection,
    prefix: env.REDIS_BULL_PREFIX,
    concurrency: 5,
  }
);
