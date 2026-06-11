import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, './.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

async function run() {
  const sessionId = '77929d02-66c1-4c61-94a1-976d702b172e';
  const url = `http://localhost:8000/debug/trace/session/${sessionId}`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Status: ${res.status}`);
    const data = await res.json();
    
    console.log(`=== Trace Steps for Session ${sessionId} ===\n`);
    
    // Sort spans by start_time
    data.sort((a, b) => a.start_time - b.start_time);
    
    for (const span of data) {
      const durationMs = (span.end_time - span.start_time);
      console.log(`- [${new Date(span.start_time / 1000).toISOString()}] Span: "${span.name}" | Status: ${span.status?.code || 'UNSPECIFIED'} | Duration: ${durationMs}ms`);
      if (span.status?.message) {
        console.log(`  ERROR: ${span.status.message}`);
      }
      if (span.attributes) {
        const toolName = span.attributes['gcp.vertex.agent.tool_name'];
        if (toolName) {
          console.log(`  Tool Name: ${toolName}`);
        }
        const errorMsg = span.attributes['gcp.vertex.agent.error'];
        if (errorMsg) {
          console.log(`  Agent Error: ${errorMsg}`);
        }
      }
    }
  } catch (err) {
    console.error('Error fetching trace:', err);
  }
}

run();
