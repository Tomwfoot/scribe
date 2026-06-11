import { ConvexHttpClient } from 'convex/browser';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Scribe's local .env
const envPath = path.resolve(__dirname, './.env');
dotenv.config({ path: envPath });

// Load Book of Me root .env.local
const envLocalPath = path.resolve(__dirname, '../../.env.local');
dotenv.config({ path: envLocalPath });

const convexUrl = process.env.VITE_CONVEX_URL || 'http://localhost:3001';
const secretKey = process.env.SCRIBE_SECRET_KEY || 'scribe-hackathon-default-secret';

const client = new ConvexHttpClient(convexUrl);

async function testSync() {
  try {
    const userId = process.env.SCRIBE_TEST_USER_ID;
    console.log('Querying profile for:', userId);
    
    const chapters = await client.query('scribe:getChapters', {
      userId: userId,
      secretKey: secretKey,
    });
    console.log(`\nFound ${chapters.length} chapters.`);
    for (let i = 0; i < Math.min(3, chapters.length); i++) {
      const ch = chapters[i];
      console.log(`\n--- Chapter ${i+1}: "${ch.title}" (ClientId: ${ch.clientId}) ---`);
      console.log(`Content length: ${ch.content?.length || 0}`);
      console.log(`Content Snippet: "${ch.content ? ch.content.substring(0, 400) + '...' : ''}"`);
      console.log(`Transcription Notes:`, JSON.stringify(ch.transcriptionNotes || []));
      console.log(`Chat Threads Count: ${ch.chatThreads?.length || 0}`);
    }
  } catch (error) {
    console.error('Inspection failed:', error);
  }
}

testSync();
