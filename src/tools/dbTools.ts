import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { ConvexHttpClient } from 'convex/browser';
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

export const convexUrl = process.env.VITE_CONVEX_URL || 'http://localhost:3001';
export const secretKey = process.env.SCRIBE_SECRET_KEY || 'scribe-hackathon-default-secret';
export const client = new ConvexHttpClient(convexUrl);

/**
 * Tool to fetch Story Bible entities.
 */
export function resolveUserId(providedId?: string): string {
  const userId = providedId || process.env.SCRIBE_TEST_USER_ID;
  if (!userId) {
    throw new Error('No userId provided and SCRIBE_TEST_USER_ID not set in .env');
  }
  return userId;
}

/**
 * Tool to fetch Story Bible entities.
 */
export const getStoryBibleTool = new FunctionTool({
  name: 'get_story_bible',
  description: 'Fetches the active Story Bible entities (people, places, events, themes) for the specified user.',
  parameters: z.object({
    userId: z.string().optional().describe('The unique tokenIdentifier or Clerk ID of the user. Optional, defaults to the test user.'),
  }) as any,
  execute: async ({ userId }: any) => {
    try {
      const resolvedId = resolveUserId(userId);
      console.log(`[dbTools] get_story_bible for user ${resolvedId}`);
      const entities = await client.query('scribe:getEntities' as any, { userId: resolvedId, secretKey });
      return { status: 'success', entities };
    } catch (error: any) {
      console.error(`[dbTools] Error in get_story_bible:`, error);
      return { status: 'error', message: error.message };
    }
  }
});

/**
 * Tool to update or create a Story Bible entity.
 */
export const updateStoryBibleTool = new FunctionTool({
  name: 'update_story_bible',
  description: 'Updates or creates a Story Bible entity for the specified user. If the entity already exists, new description info is merged/appended.',
  parameters: z.object({
    userId: z.string().optional().describe('The unique tokenIdentifier or Clerk ID of the user. Optional, defaults to the test user.'),
    name: z.string().describe('The name of the entity (e.g., "Uncle Bob").'),
    category: z.enum(['Person', 'Place', 'Event', 'Theme', 'Other']).describe('The category of the entity.'),
    description: z.string().describe('Detailed description/facts about the entity.'),
    appearance: z.string().optional().describe('Visual appearance details (e.g., "Tall, red hair").'),
    alias: z.array(z.string()).optional().describe('Alternative names or aliases for the entity.'),
  }) as any,
  execute: async ({ userId, name, category, description, appearance, alias }: any) => {
    try {
      const resolvedId = resolveUserId(userId);
      console.log(`[dbTools] update_story_bible for user ${resolvedId}, entity: ${name}`);
      const entityId = await client.mutation('scribe:updateEntity' as any, {
        userId: resolvedId,
        secretKey,
        name,
        category,
        description,
        appearance,
        alias
      });
      return { status: 'success', entityId };
    } catch (error: any) {
      console.error(`[dbTools] Error in update_story_bible:`, error);
      return { status: 'error', message: error.message };
    }
  }
});

/**
 * Tool to archive a Story Bible entity.
 */
export const archiveEntityTool = new FunctionTool({
  name: 'archive_entity',
  description: 'Archives a Story Bible entity by its Convex ID.',
  parameters: z.object({
    userId: z.string().optional().describe('The unique tokenIdentifier or Clerk ID of the user. Optional, defaults to the test user.'),
    id: z.string().describe('The Convex _id of the entity to archive.'),
  }) as any,
  execute: async ({ userId, id }: any) => {
    try {
      const resolvedId = resolveUserId(userId);
      console.log(`[dbTools] archive_entity for user ${resolvedId}, id: ${id}`);
      await client.mutation('scribe:archiveEntity' as any, { userId: resolvedId, secretKey, id: id as any });
      return { status: 'success' };
    } catch (error: any) {
      console.error(`[dbTools] Error in archive_entity:`, error);
      return { status: 'error', message: error.message };
    }
  }
});

/**
 * Tool to fetch all chapters.
 */
export const getAllChaptersTool = new FunctionTool({
  name: 'get_all_chapters',
  description: 'Fetches all chapter drafts (including content, summaries, order, transcriptionNotes) for the specified user.',
  parameters: z.object({
    userId: z.string().optional().describe('The unique tokenIdentifier or Clerk ID of the user. Optional, defaults to the test user.'),
  }) as any,
  execute: async ({ userId }: any) => {
    try {
      const resolvedId = resolveUserId(userId);
      console.log(`[dbTools] get_all_chapters for user ${resolvedId}`);
      const chapters = await client.query('scribe:getChapters' as any, { userId: resolvedId, secretKey });
      return { status: 'success', chapters };
    } catch (error: any) {
      console.error(`[dbTools] Error in get_all_chapters:`, error);
      return { status: 'error', message: error.message };
    }
  }
});

/**
 * Tool to fetch a single chapter by clientId.
 */
export const getChapterByIdTool = new FunctionTool({
  name: 'get_chapter_by_id',
  description: 'Fetches a single chapter by its clientId. Returns the full chapter data including content (raw transcript), chatThreads (interview dialogue), transcriptionNotes, title, summary, images, etc.',
  parameters: z.object({
    userId: z.string().optional().describe('The unique tokenIdentifier or Clerk ID of the user. Optional, defaults to the test user.'),
    clientId: z.string().describe('The clientId of the chapter to fetch.'),
  }) as any,
  execute: async ({ userId, clientId }: any) => {
    try {
      const resolvedId = resolveUserId(userId);
      console.log(`[dbTools] get_chapter_by_id for user ${resolvedId}, clientId: ${clientId}`);
      const chapter = await client.query('scribe:getChapterByClientId' as any, { userId: resolvedId, secretKey, clientId });
      if (!chapter) {
        return { status: 'error', message: `Chapter with clientId ${clientId} not found.` };
      }
      return { status: 'success', chapter };
    } catch (error: any) {
      console.error(`[dbTools] Error in get_chapter_by_id:`, error);
      return { status: 'error', message: error.message };
    }
  }
});

/**
 * Tool to sync a chapter draft.
 */
export const syncChapterTool = new FunctionTool({
  name: 'sync_chapter',
  description: 'Synchronizes (creates or updates) a chapter draft for the specified user.',
  parameters: z.object({
    userId: z.string().optional().describe('The unique tokenIdentifier or Clerk ID of the user. Optional, defaults to the test user.'),
    clientId: z.string().describe('The clientId (typically timestamp string) of the chapter.'),
    title: z.string().describe('The title of the chapter.'),
    summary: z.string().describe('A summary of the chapter contents.'),
    content: z.string().describe('The actual drafted narrative text of the chapter.'),
    lastEdited: z.number().describe('Current timestamp of the edit.'),
    chatThreads: z.any().describe('The chat threads / messages array for the chapter.'),
    images: z.any().describe('The array of images associated with the chapter.'),
    transcriptionNotes: z.array(z.string()).optional().describe('Notes/nuggets gathered during interviewing.'),
    order: z.number().optional().describe('The display order of the chapter.'),
  }) as any,
  execute: async ({
    userId,
    clientId,
    title,
    summary,
    content,
    lastEdited,
    chatThreads,
    images,
    transcriptionNotes,
    order
  }: any) => {
    try {
      const resolvedId = resolveUserId(userId);
      console.log(`[dbTools] sync_chapter for user ${resolvedId}, chapter: ${title}`);
      const chapterId = await client.mutation('scribe:syncChapter' as any, {
        userId: resolvedId,
        secretKey,
        clientId,
        title,
        summary,
        content,
        lastEdited,
        chatThreads,
        images,
        transcriptionNotes,
        order
      });
      return { status: 'success', chapterId };
    } catch (error: any) {
      console.error(`[dbTools] Error in sync_chapter:`, error);
      return { status: 'error', message: error.message };
    }
  }
});

/**
 * Tool to update only the chapter content/draft, preserving all other metadata.
 * This is simpler and safer for the consensus pipeline to use.
 */
export const updateChapterContentTool = new FunctionTool({
  name: 'update_chapter_content',
  description: 'Updates ONLY the content/draft text of an existing chapter, preserving all other metadata (chatThreads, images, transcriptionNotes, etc.). Use this to save polished drafts.',
  parameters: z.object({
    userId: z.string().optional().describe('The unique tokenIdentifier or Clerk ID of the user. Optional, defaults to the test user.'),
    clientId: z.string().describe('The clientId of the chapter to update.'),
    content: z.string().describe('The new polished draft text for the chapter.'),
  }) as any,
  execute: async ({ userId, clientId, content }: any) => {
    try {
      const resolvedId = resolveUserId(userId);
      console.log(`[dbTools] update_chapter_content for user ${resolvedId}, clientId: ${clientId}, content length: ${content?.length || 0}`);
      const chapterId = await client.mutation('scribe:updateChapterContent' as any, {
        userId: resolvedId,
        secretKey,
        clientId,
        content,
      });
      return { status: 'success', chapterId };
    } catch (error: any) {
      console.error(`[dbTools] Error in update_chapter_content:`, error);
      return { status: 'error', message: error.message };
    }
  }
});

/**
 * Tool to fetch user profile details.
 */
export const getUserProfileTool = new FunctionTool({
  name: 'get_user_profile',
  description: 'Fetches the user profile including bookTitle, authorName, dedication, language, bookStatus, and subscriptionTier.',
  parameters: z.object({
    userId: z.string().optional().describe('The unique tokenIdentifier or Clerk ID of the user. Optional, defaults to the test user.'),
  }) as any,
  execute: async ({ userId }: any) => {
    try {
      const resolvedId = resolveUserId(userId);
      console.log(`[dbTools] get_user_profile for user ${resolvedId}`);
      const profile = await client.query('scribe:getUserProfile' as any, { userId: resolvedId, secretKey });
      return { status: 'success', profile };
    } catch (error: any) {
      console.error(`[dbTools] Error in get_user_profile:`, error);
      return { status: 'error', message: error.message };
    }
  }
});

/**
 * Helper to fetch file URL from Convex Storage ID.
 */
export async function getFileUrl(userId: string | undefined, storageId: string): Promise<string | null> {
  try {
    const resolvedId = resolveUserId(userId);
    return await client.query('scribe:getFileUrl' as any, { userId: resolvedId, secretKey, storageId });
  } catch (error) {
    console.error(`[dbTools] Failed to get file URL:`, error);
    return null;
  }
}

/**
 * Tool to save the author's prose style profile.
 */
export const saveProseStyleTool = new FunctionTool({
  name: 'save_prose_style',
  description: 'Saves the author\'s prose style preferences (from the 10-question Style Editor quiz) to the database. Call this after all 10 A/B choices have been collected.',
  parameters: z.object({
    userId: z.string().optional().describe('The unique tokenIdentifier or Clerk ID of the user. Optional, defaults to the test user.'),
    sentenceRhythm: z.enum(['flowing', 'varied']).describe('Preference for sentence rhythm: flowing (long, compound) or varied (short, punchy, mixed).'),
    formality: z.enum(['literary', 'conversational']).describe('Register: literary (polished) or conversational (kitchen-table warmth).'),
    sensoryDetail: z.enum(['sparse', 'rich']).describe('Density of sensory language: sparse (fact-forward) or rich (immersive).'),
    emotionalTransparency: z.enum(['understated', 'open']).describe('Emotional disclosure: understated (implied) or open (vulnerable).'),
    dialogueUsage: z.enum(['summary', 'reconstructed']).describe('Dialogue approach: summary (narrative retelling) or reconstructed (direct speech).'),
    temporalFlow: z.enum(['chronological', 'reflective']).describe('Time structure: chronological (linear) or reflective (weaving past and present).'),
    paragraphDensity: z.enum(['dense', 'short']).describe('Paragraph style: dense (6-10 sentences) or short (2-4 sentences).'),
    figurativeLanguage: z.enum(['plain', 'lyrical']).describe('Figurative language: plain (direct, literal) or lyrical (metaphor-rich).'),
    povDistance: z.enum(['intimate', 'reflective']).describe('POV distance: intimate (close first-person) or reflective (distanced narrator).'),
    humour: z.enum(['earnest', 'wry']).describe('Tonal personality: earnest (reverent) or wry (self-deprecating wit).'),
  }) as any,
  execute: async ({ userId, ...styleFields }: any) => {
    try {
      const resolvedId = resolveUserId(userId);
      console.log(`[dbTools] save_prose_style for user ${resolvedId}`);
      const result = await client.mutation('scribe:saveProseStyle' as any, {
        userId: resolvedId,
        secretKey,
        proseStyle: styleFields,
      });
      return { status: 'success', result };
    } catch (error: any) {
      console.error(`[dbTools] Error in save_prose_style:`, error);
      return { status: 'error', message: error.message };
    }
  }
});

/**
 * Tool to fetch the author's prose style profile.
 */
export const getProseStyleTool = new FunctionTool({
  name: 'get_prose_style',
  description: 'Fetches the author\'s saved prose style preferences. Returns null if the Style Editor quiz has not been completed yet.',
  parameters: z.object({
    userId: z.string().optional().describe('The unique tokenIdentifier or Clerk ID of the user. Optional, defaults to the test user.'),
  }) as any,
  execute: async ({ userId }: any) => {
    try {
      const resolvedId = resolveUserId(userId);
      console.log(`[dbTools] get_prose_style for user ${resolvedId}`);
      const proseStyle = await client.query('scribe:getProseStyle' as any, { userId: resolvedId, secretKey });
      return { status: 'success', proseStyle };
    } catch (error: any) {
      console.error(`[dbTools] Error in get_prose_style:`, error);
      return { status: 'error', message: error.message };
    }
  }
});
