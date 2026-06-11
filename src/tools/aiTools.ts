import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { GoogleGenAI } from '@google/genai';
import { getFileUrl } from './dbTools.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Scribe's local .env and root .env.local with robust paths (compatible with ADK temp file execution)
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../../.env.local') });

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
const ai = new GoogleGenAI({ apiKey });

// Helper for rate limit retries
const callWithRetry = async <T>(fn: () => Promise<T>, retries = 5, delay = 4000): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    if (retries > 0 && (error.message?.includes('429') || error.status === 429)) {
      console.warn(`[aiTools] Rate limited (429). Retrying in ${delay}ms... (Attempts left: ${retries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return callWithRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
};

/**
 * Tool to extract Story Bible entities from text.
 */
export const extractStoryFactsTool = new FunctionTool({
  name: 'extract_story_facts',
  description: 'Analyzes memoir text and extracts key persistent entities (People, Places, Events, Themes) with metadata for the Story Bible.',
  parameters: z.object({
    text: z.string().describe('The memoir draft or transcript text to analyze.'),
    sourceChapter: z.string().describe('The chapter number (1-10) this text belongs to.'),
  }) as any,
  execute: async ({ text, sourceChapter }: any) => {
    try {
      console.log(`[aiTools] extract_story_facts for chapter ${sourceChapter}`);
      const prompt = `
        Analyze the following memoir text and extract KEY persistent entities to build a "Story Bible" for the author.
        Ignore generic nouns (neighbors, school, car) unless they are specific and named.
        
        Output a JSON array of objects with this structure:
        {
          "category": "Person" | "Place" | "Event" | "Theme" | "Other",
          "name": "Exact Name" (e.g. "Uncle Bob", "Grandma Sarah", "The Old House"),
          "description": "Concise factual description of who/what they are based ONLY on this text. (e.g. 'Mother's younger brother, lived in Ohio, drove a red Ford truck').",
          "appearance": "Physical description if available (optional)",
          "alias": ["Alternative names used"],
          "chapter_hint": "If this entity or fact primarily belongs to a different chapter (e.g., mentions a marriage while talking about work), specify the chapter number (1-10) here as a string. Otherwise, leave empty.",
          "source_chapter": "${sourceChapter}",
          "verbatim_quote": "If this is a cross-chapter nugget (belongs in a different chapter), include the exact verbatim quote where the user mentioned it. Otherwise, leave empty."
        }

        Focus on:
        1. Family members and meaningful relationships.
        2. Specific locations (towns, houses, schools).
        3. Key life events (weddings, wars, accidents).
        4. Recurring themes/phrases.

        Text to Analyze:
        "${text.substring(0, 45000)}"
      `;

      const result = await callWithRetry(() =>
        ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          },
        })
      );

      const jsonString = result.text || '[]';
      return JSON.parse(jsonString);
    } catch (error: any) {
      console.error(`[aiTools] Error in extract_story_facts:`, error);
      return [];
    }
  }
});

/**
 * Tool to transcribe audio interviews using Gemini multimodal capabilities.
 */
export const transcribeAudioTool = new FunctionTool({
  name: 'transcribe_audio',
  description: 'Transcribes an audio interview file from Convex storage and returns a transcript and editor notes.',
  parameters: z.object({
    userId: z.string().describe('The user ID of the author.'),
    storageId: z.string().describe('The Convex storage ID of the audio file.'),
    mode: z.enum(['clean', 'polished']).describe('Whether to produce a "clean" verbatim transcript or a "polished" prose narrative.'),
    language: z.string().optional().describe('The language code (e.g., "en-US", "en-GB"). Defaults to "en-US".'),
    storyBibleText: z.string().optional().describe('Context from the Story Bible to maintain factual consistency.'),
  }) as any,
  execute: async ({ userId, storageId, mode, language = 'en-US', storyBibleText = '' }: any, tool_context?: any) => {
    try {
      console.log(`[aiTools] transcribe_audio for storageId ${storageId}`);
      const fileUrl = await getFileUrl(userId, storageId, tool_context);
      if (!fileUrl) {
        throw new Error(`Failed to retrieve file URL for storageId: ${storageId}`);
      }

      console.log(`[aiTools] Downloading audio from: ${fileUrl}`);
      const fileResponse = await fetch(fileUrl);
      if (!fileResponse.ok) {
        throw new Error(`Failed to download audio file. HTTP status: ${fileResponse.status}`);
      }

      const arrayBuffer = await fileResponse.arrayBuffer();
      const base64Data = Buffer.from(arrayBuffer).toString('base64');
      const mimeType = fileResponse.headers.get('content-type') || 'audio/webm';

      const houseStyleInstructions = language === 'en-GB'
        ? 'Use British English throughout (colour, behaviour, analyse, centre, defence). Dates: 15 March 2026. Times: 7pm, 3.30am.'
        : 'Use American English throughout (color, behavior, analyze, center, defense). Dates: March 15, 2026. Times: 7 p.m., 3:30 a.m.';

      const systemPrompt = `
        Persona: You are the Lead Ghostwriter and Audio Analyst for Book of Me. Your expertise lies in voice identification, "Clean Verbatim" transcription, and high-level narrative restructuring. Your goal is to turn raw, multi-speaker interviews into a professional, cohesive memoir while maintaining the Author's unique personality and "voice."

        1. Speaker Identification Logic (CRITICAL)
        * STEP 1: ACOUSTIC ANALYSIS. Listen carefully to the audio. Are there distinctions in pitch, timbre, tone, or pacing between voices?
        * STEP 2: CONVERSATIONAL ANALYSIS. Is there a Q&A pattern? (Person A asks, Person B answers).
        * Single Speaker: If only one voice is heard throughout -> OUTPUT TEXT ONLY. No tags.
        * Multiple Speakers: If a second voice (Interviewer) is present, YOU MUST use tags.
        * ROLES:
            - [Author]: The main storyteller/subject.
            - [Interviewer]: The person asking the questions.
        
        Transformation Instruction:
        ${mode === 'clean'
          ? `
            OPTION 1: "Clean Transcript" (Verbatim Mirror)
            "Perform a 'Clean Verbatim' edit. Remove all filler words (um, ah), stutters, and false starts. Fix grammatical errors only where they impede understanding."
            
            Rules for Speaker Tags:
            * IF SINGLE SPEAKER: Output pure text. NO tags. (e.g. "I was born in 1990...")
            * IF MULTIPLE SPEAKERS: Use [Author]: and [Interviewer]: tags to distinguish voices.
            `
          : `
            OPTION 2: "Polished Narrative" (The Ghostwriter)
            "Act as a LifeBook Ghostwriter. Transform this spoken interview into a coherent, flowing book chapter told in the first person (Author's voice)."
            
            CRITICAL RULE: NO SPEAKER TAGS
            * Never use [Author] or [Interviewer] tags in this mode.
            * If an Interviewer asks a question, weave the answer into the narrative contextually (e.g. "When asked about my childhood, I remembered...").
            * The output must be pure, uninterrupted prose.
            
            Rules:
            * Logical Flow: Reorganize thoughts to follow a clear beginning, middle, and end.
            * Sensory Enhancement: If the author mentions a 'marker', ensure sensory detail is prominent.
            * Story Architecture: Move the most impactful "hook" to the start.
            `
        }

        HOUSE STYLE GUIDE:
        ${houseStyleInstructions}

        ${storyBibleText ? `STORY BIBLE (Established Facts):\n${storyBibleText}` : ''}

        Post-Processing Output (Editor's Notes)
        At the very end of your response, strictly separated by "|||NOTES|||", provide:
        1. Themes Identified
        2. Missing Ingredients (Flag for Interviewer follow-up, e.g., "Mentioned 'Teacher Smith' but no description")
        
        Format your response as:
        [Transcription/Narrative Text]
        |||NOTES|||
        [Editor's Notes Content]
      `;

      const result = await callWithRetry(() =>
        ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType
              }
            },
            { text: systemPrompt }
          ]
        })
      );

      const fullText = result.text || '';
      const parts = fullText.split('|||NOTES|||');
      const text = parts[0].trim();
      const notes = parts.length > 1 ? parts[1].trim() : '';

      return { status: 'success', text, notes };
    } catch (error: any) {
      console.error(`[aiTools] Error in transcribe_audio:`, error);
      return { status: 'error', message: error.message };
    }
  }
});
