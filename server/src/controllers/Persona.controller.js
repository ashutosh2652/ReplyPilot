import Persona from "../models/Persona.models.js";
import PersonaExample from "../models/PersonaExample.models.js";
import mongoose from "mongoose";

export async function createPersona(req, res, next) {
  try {
    const { name, tone, creatorBio, vocabulary, examples, isDefault } = req.body;
    if (!name || !tone) return res.status(400).json({ error: 'name and tone are required' });

    // If this is being set as default, unset all others for this user
    if (isDefault) {
      await Persona.updateMany({ userId: req.user._id }, { isDefault: false });
    }

    const persona = await Persona.create({
      userId: req.user._id,
      name, tone, creatorBio, vocabulary, examples, isDefault: isDefault ?? false,
    });

    return res.status(201).json({ data: persona });
  } catch (err) {
    next(err);
  }
}

export async function listPersonas(req, res, next) {
  try {
    const personas = await Persona.find({ userId: req.user._id }).sort({ createdAt: -1 }).lean();
    return res.json({ data: personas });
  } catch (err) {
    next(err);
  }
}

export async function getPersona(req, res, next) {
  try {
    const persona = await Persona.findOne({ _id: req.params.id, userId: req.user._id }).lean();
    if (!persona) return res.status(404).json({ error: 'Persona not found' });
    return res.json({ data: persona });
  } catch (err) {
    next(err);
  }
}

export async function updatePersona(req, res, next) {
  try {
    const { isDefault, ...fields } = req.body;
    if (isDefault) {
      await Persona.updateMany({ userId: req.user._id }, { isDefault: false });
    }
    const persona = await Persona.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { ...fields, ...(isDefault !== undefined && { isDefault }) },
      { new: true }
    );
    if (!persona) return res.status(404).json({ error: 'Persona not found' });
    return res.json({ data: persona });
  } catch (err) {
    next(err);
  }
}

export async function deletePersona(req, res, next) {
  try {
    const persona = await Persona.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!persona) return res.status(404).json({ error: 'Persona not found' });
    return res.json({ message: 'Persona deleted' });
  } catch (err) {
    next(err);
  }
}


export async function analyzePersona(req, res, next) {
  try {
    const { bio } = req.body;
    if (!bio || bio.trim().length < 10) {
      return res.status(400).json({ error: 'Please provide a bio of at least 10 characters' });
    }

    // TODO: replace this stub with an AI analysis service when available
    const result = {
      tone: 'friendly',
      creatorBio: bio.trim(),
    };

    return res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function findSimilarPersonaExamples(req, res, next) {
  try {
    const { id: personaId } = req.params;
    const { scores } = req.body; 

    // Expecting array of 5 numbers [question, praise, critism, neutral, spam]
    if (!Array.isArray(scores) || scores.length !== 5) {
      return res.status(400).json({ error: 'scores must be an array of exactly 5 numbers corresponding to [question, praise, critism, neutral, spam]' });
    }

    if (scores.every(s => s === 0)) {
      return res.json({ data: [] });
    }

    const similarExamples = await PersonaExample.aggregate([
      {
        $match: { 
          personaId: new mongoose.Types.ObjectId(personaId),
          $or: [
            { "scores.question": { $gt: 0 } },
            { "scores.praise": { $gt: 0 } },
            { "scores.critism": { $gt: 0 } },
            { "scores.neutral": { $gt: 0 } },
            { "scores.spam": { $gt: 0 } }
          ]
        }
      },
      {
        $addFields: {
          similarity: {
            $let: {
              vars: {
                q: scores,
                d: [
                  "$scores.question",
                  "$scores.praise",
                  "$scores.critism",
                  "$scores.neutral",
                  "$scores.spam"
                ]
              },
              in: {
                $divide: [
                  {
                    $sum: {
                      $map: {
                        input: { $range: [0, 5] },
                        as: "i",
                        in: {
                          $multiply: [
                            { $arrayElemAt: ["$$q", "$$i"] },
                            { $arrayElemAt: ["$$d", "$$i"] }
                          ]
                        }
                      }
                    }
                  },
                  {
                    $multiply: [
                      {
                        $sqrt: {
                          $sum: {
                            $map: {
                              input: "$$q",
                              as: "x",
                              in: { $multiply: ["$$x", "$$x"] }
                            }
                          }
                        }
                      },
                      {
                        $sqrt: {
                          $sum: {
                            $map: {
                              input: "$$d",
                              as: "x",
                              in: { $multiply: ["$$x", "$$x"] }
                            }
                          }
                        }
                      }
                    ]
                  }
                ]
              }
            }
          }
        }
      },
      {
        // Avoid division by zero from empty examples throwing errors in sorting/filtering
        $match: { similarity: { $ne: null } }
      },
      {
        $sort: { similarity: -1 }
      },
      {
        $limit: 4
      }
    ]);

    return res.json({ data: similarExamples });
  } catch (err) {
    next(err);
  }
}
