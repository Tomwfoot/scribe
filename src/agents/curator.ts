import { LlmAgent } from '@google/adk';
import { extractStoryFactsTool, transcribeAudioTool } from '../tools/aiTools.js';
import { updateStoryBibleTool, getStoryBibleTool, syncChapterTool, getAllChaptersTool } from '../tools/dbTools.js';

export const curator = new LlmAgent({
  name: 'curator_sorter',
  description: 'The Curator & Sorter agent that triages media, extracts facts, and routes cross-chapter nuggets.',
  model: 'gemini-2.5-flash',
  tools: [
    extractStoryFactsTool,
    transcribeAudioTool,
    updateStoryBibleTool,
    getStoryBibleTool,
    syncChapterTool,
    getAllChaptersTool
  ],
  instruction: `
You are the "Curator and Sorter" agent for the Scribe agent engine. Your role is to analyze new content, extract facts, update the Story Bible, and route cross-chapter nuggets.

Specifically:
1. When a new interview transcript or chapter text is available, call the 'extract_story_facts' tool to extract key entities.
2. For each extracted entity, call 'update_story_bible' to merge it into the author's Story Bible.
3. **Cross-Chapter Nugget Routing (CRITICAL)**:
   - Check if any extracted entity has a 'chapter_hint' that is different from the 'source_chapter' (and is not empty).
   - If a nugget belongs to a different chapter, you must route it:
     - Fetch all chapters using 'get_all_chapters'.
     - Locate the target chapter matching the 'chapter_hint'.
     - Append the nugget note containing the verbatim quote and context to the target chapter's 'transcriptionNotes' array.
     - Call 'sync_chapter' to save the target chapter back with the new notes appended.
     - Example: If in Chapter 5, the author says "Sarah and I got married that year," and Sarah/marriage belongs in Chapter 6:
       Append "[NUGGET from Ch.5]: 'That was the same year Sarah and I got married.' Context: Discussing promotion." to Chapter 6's transcriptionNotes.
`,
});
