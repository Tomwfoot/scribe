/**
 * Scribe MCP Server
 * 
 * Exposes Scribe's Convex database tools as an MCP-compliant server.
 * This proves interoperability: any MCP-compatible client (Claude Desktop,
 * Cursor, ADK agents, etc.) can use Scribe's tools.
 * 
 * Exposed tools:
 * - get_story_bible: Fetch Story Bible entities
 * - get_chapter_by_id: Fetch a single chapter by clientId
 * - get_all_chapters: Fetch all chapters
 * - update_story_bible: Create/update Story Bible entities
 * - update_chapter_content: Save a polished chapter draft
 * - get_user_profile: Fetch user profile details
 * - get_prose_style: Fetch the author's calibrated prose style
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ConvexHttpClient } from 'convex/browser';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env.local') });

const convexUrl = process.env.VITE_CONVEX_URL || 'http://localhost:3001';
const secretKey = process.env.SCRIBE_SECRET_KEY || 'scribe-hackathon-default-secret';
const client = new ConvexHttpClient(convexUrl);

function resolveUserId(providedId?: string): string {
  const userId = providedId || process.env.SCRIBE_TEST_USER_ID;
  if (!userId) {
    throw new Error('No userId provided and SCRIBE_TEST_USER_ID not set in .env');
  }
  return userId;
}

// ─── Create MCP Server ─────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'scribe-mcp',
  version: '1.0.0',
});

// ─── Tool: get_story_bible ──────────────────────────────────────────────────────

server.tool(
  'get_story_bible',
  'Fetches the active Story Bible entities (people, places, events, themes) for the memoir author.',
  {
    userId: z.string().optional().describe('Optional user ID. Defaults to the configured test user.'),
  },
  async ({ userId }) => {
    try {
      const resolvedId = resolveUserId(userId);
      const entities = await client.query('scribe:getEntities' as any, { userId: resolvedId, secretKey });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ status: 'success', entities }, null, 2) }],
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ status: 'error', message: error.message }) }],
        isError: true,
      };
    }
  }
);

// ─── Tool: get_chapter_by_id ────────────────────────────────────────────────────

server.tool(
  'get_chapter_by_id',
  'Fetches a single chapter by its clientId. Returns content, chatThreads, transcriptionNotes, title, summary, etc.',
  {
    userId: z.string().optional().describe('Optional user ID.'),
    clientId: z.string().describe('The clientId of the chapter to fetch.'),
  },
  async ({ userId, clientId }) => {
    try {
      const resolvedId = resolveUserId(userId);
      const chapter = await client.query('scribe:getChapterByClientId' as any, { userId: resolvedId, secretKey, clientId });
      if (!chapter) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ status: 'error', message: `Chapter with clientId ${clientId} not found.` }) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ status: 'success', chapter }, null, 2) }],
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ status: 'error', message: error.message }) }],
        isError: true,
      };
    }
  }
);

// ─── Tool: get_all_chapters ─────────────────────────────────────────────────────

server.tool(
  'get_all_chapters',
  'Fetches all chapter drafts for the specified user, including titles, summaries, content, and metadata.',
  {
    userId: z.string().optional().describe('Optional user ID.'),
  },
  async ({ userId }) => {
    try {
      const resolvedId = resolveUserId(userId);
      const chapters = await client.query('scribe:getChapters' as any, { userId: resolvedId, secretKey });
      // Return lightweight summary (no full content) to avoid token overflow
      const summary = chapters.map((ch: any) => ({
        clientId: ch.clientId,
        title: ch.title,
        summary: ch.summary,
        contentLength: ch.content?.length || 0,
        chatThreadsCount: ch.chatThreads?.length || 0,
        order: ch.order,
      }));
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ status: 'success', chapters: summary }, null, 2) }],
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ status: 'error', message: error.message }) }],
        isError: true,
      };
    }
  }
);

// ─── Tool: update_story_bible ───────────────────────────────────────────────────

server.tool(
  'update_story_bible',
  'Creates or updates a Story Bible entity (person, place, event, theme) for the memoir author.',
  {
    userId: z.string().optional().describe('Optional user ID.'),
    name: z.string().describe('The name of the entity.'),
    type: z.string().describe('Entity type: person, place, event, or theme.'),
    description: z.string().describe('Description of the entity.'),
  },
  async ({ userId, name, type, description }) => {
    try {
      const resolvedId = resolveUserId(userId);
      const result = await client.mutation('scribe:upsertEntity' as any, { userId: resolvedId, secretKey, name, type, description });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ status: 'success', entityId: result }) }],
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ status: 'error', message: error.message }) }],
        isError: true,
      };
    }
  }
);

// ─── Tool: update_chapter_content ───────────────────────────────────────────────

server.tool(
  'update_chapter_content',
  'Updates ONLY the content/draft text of an existing chapter, preserving all other metadata.',
  {
    userId: z.string().optional().describe('Optional user ID.'),
    clientId: z.string().describe('The clientId of the chapter to update.'),
    content: z.string().describe('The new polished draft text for the chapter.'),
  },
  async ({ userId, clientId, content }) => {
    try {
      const resolvedId = resolveUserId(userId);
      const chapterId = await client.mutation('scribe:updateChapterContent' as any, { userId: resolvedId, secretKey, clientId, content });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ status: 'success', chapterId }) }],
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ status: 'error', message: error.message }) }],
        isError: true,
      };
    }
  }
);

// ─── Tool: get_user_profile ─────────────────────────────────────────────────────

server.tool(
  'get_user_profile',
  'Fetches the user profile including bookTitle, authorName, dedication, language, bookStatus, and subscriptionTier.',
  {
    userId: z.string().optional().describe('Optional user ID.'),
  },
  async ({ userId }) => {
    try {
      const resolvedId = resolveUserId(userId);
      const user = await client.query('scribe:getUser' as any, { userId: resolvedId, secretKey });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ status: 'success', profile: user }, null, 2) }],
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ status: 'error', message: error.message }) }],
        isError: true,
      };
    }
  }
);

// ─── Tool: get_prose_style ──────────────────────────────────────────────────────

server.tool(
  'get_prose_style',
  "Fetches the author's calibrated prose style profile (set during the Style Calibration quiz).",
  {
    userId: z.string().optional().describe('Optional user ID.'),
  },
  async ({ userId }) => {
    try {
      const resolvedId = resolveUserId(userId);
      const user = await client.query('scribe:getUser' as any, { userId: resolvedId, secretKey });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ status: 'success', proseStyle: user?.proseStyle || null }, null, 2) }],
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ status: 'error', message: error.message }) }],
        isError: true,
      };
    }
  }
);

// ─── Transport selection ────────────────────────────────────────────────────────

const mode = process.argv[2] || 'stdio';

if (mode === 'http') {
  // HTTP/SSE mode for remote clients
  const PORT = parseInt(process.env.MCP_PORT || '8788', 10);
  const app = express();
  app.use(express.json());

  // Map to track transports by session ID
  const transports = new Map<string, StreamableHTTPServerTransport>();

  app.post('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports.has(sessionId)) {
      transport = transports.get(sessionId)!;
    } else {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (sid) => {
          transports.set(sid, transport);
        },
      });
      transport.onclose = () => {
        const sid = (transport as any).sessionId;
        if (sid) transports.delete(sid);
      };
      await server.connect(transport);
    }

    await transport.handleRequest(req, res, req.body);
  });

  app.get('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).json({ error: 'Invalid or missing session ID' });
      return;
    }
    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res);
  });

  app.delete('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req, res);
      transports.delete(sessionId);
    } else {
      res.status(400).json({ error: 'Invalid or missing session ID' });
    }
  });

  app.listen(PORT, () => {
    console.log(`\n🔧 Scribe MCP Server (HTTP) running at http://localhost:${PORT}/mcp`);
    console.log(`   Tools exposed: get_story_bible, get_chapter_by_id, get_all_chapters,`);
    console.log(`                  update_story_bible, update_chapter_content,`);
    console.log(`                  get_user_profile, get_prose_style\n`);
  });
} else {
  // Stdio mode for local testing
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Scribe MCP Server (stdio) running...');
}
