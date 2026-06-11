import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Scribe's local .env and root .env.local with robust paths (compatible with ADK temp file execution)
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env.local') });

import { leadArchitect } from './agents/leadArchitect.js';

// Export rootAgent as required by @google/adk-devtools
export const rootAgent = leadArchitect;
