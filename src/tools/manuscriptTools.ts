import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { imageSize } from 'image-size';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  ImageRun,
  SectionType,
  AlignmentType
} from 'docx';
import { client, secretKey, resolveUserId } from './dbTools.js';

interface ImageCache {
  buffer: Buffer;
  width: number;
  height: number;
  type: 'png' | 'jpg' | 'gif' | 'bmp';
}

// Pre-fetch all images in parallel
async function preloadImages(chapters: any[]): Promise<Map<string, ImageCache>> {
  const uniqueUrls = new Set<string>();
  chapters.forEach(chapter => {
    if (chapter.images) {
      chapter.images.forEach((img: any) => {
        if (img.url) uniqueUrls.add(img.url);
      });
    }
  });

  const cache = new Map<string, ImageCache>();
  const promises = Array.from(uniqueUrls).map(async (url) => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      const dimensions = imageSize(buffer);
      const isPng = url.toLowerCase().includes('.png');
      let imgType: 'png' | 'jpg' | 'gif' | 'bmp' = isPng ? 'png' : 'jpg';
      if (dimensions.type === 'png' || dimensions.type === 'jpg' || dimensions.type === 'gif' || dimensions.type === 'bmp') {
        imgType = dimensions.type;
      }
      
      if (dimensions.width && dimensions.height) {
        cache.set(url, {
          buffer,
          width: dimensions.width,
          height: dimensions.height,
          type: imgType
        });
      }
    } catch (e) {
      console.error(`Failed to preload image: ${url}`, e);
    }
  });

  await Promise.all(promises);
  return cache;
}

// Helper to create an Image Paragraph from Cache
function createImageParagraph(img: any, targetWidth: number, includeCaption: boolean, cache: Map<string, ImageCache>): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const imgData = cache.get(img.url);

  if (imgData) {
    const scaleFactor = targetWidth / imgData.width;
    const targetHeight = Math.round(imgData.height * scaleFactor);

    paragraphs.push(
      new Paragraph({
        children: [
          new ImageRun({
            data: imgData.buffer,
            transformation: {
              width: targetWidth,
              height: targetHeight,
            },
            type: imgData.type as any,
          })
        ],
        spacing: { before: 200, after: 200 },
        alignment: AlignmentType.CENTER
      })
    );

    if (includeCaption && img.caption) {
      paragraphs.push(
        new Paragraph({
          text: img.caption,
          style: "Caption",
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 }
        })
      );
    }
  }
  return paragraphs;
}

// Helper to parse simple markdown into Docx TextRuns
function parseMarkdownToTextRuns(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const boldParts = text.split(/(\*\*[^*]+\*\*)/g);

  for (const part of boldParts) {
    if (part.startsWith('**') && part.endsWith('**')) {
      runs.push(new TextRun({
        text: part.slice(2, -2),
        bold: true
      }));
    } else {
      const italicParts = part.split(/(\*[^*]+\*)/g);
      for (const subPart of italicParts) {
        if (subPart.startsWith('*') && subPart.endsWith('*')) {
          runs.push(new TextRun({
            text: subPart.slice(1, -1),
            italics: true
          }));
        } else if (subPart.length > 0) {
          runs.push(new TextRun({ text: subPart }));
        }
      }
    }
  }
  return runs;
}

export const compileManuscriptTool = new FunctionTool({
  name: 'compile_manuscript',
  description: 'Compiles all chapters of the memoir into a styled, Vellum-compatible Word document (.docx) using exact Book of Me conventions.',
  parameters: z.object({
    userId: z.string().optional().describe('The unique tokenIdentifier or Clerk ID of the user. Optional, defaults to the test user.'),
  }) as any,
  execute: async ({ userId }: any) => {
    try {
      const resolvedId = resolveUserId(userId);
      console.log(`[manuscriptTools] Compiling manuscript for user ${resolvedId}...`);

      // 1. Fetch User Profile
      const profile: any = await client.query('scribe:getUserProfile' as any, { userId: resolvedId, secretKey });
      if (!profile) {
        throw new Error(`User profile not found for ID: ${resolvedId}`);
      }

      // 2. Fetch Chapters
      const chapters: any[] = await client.query('scribe:getChapters' as any, { userId: resolvedId, secretKey });
      if (!chapters || chapters.length === 0) {
        return {
          status: 'error',
          message: 'No chapters found to compile. Please draft some chapters first!'
        };
      }

      console.log(`[manuscriptTools] Preloading images for ${chapters.length} chapters...`);
      const imageCache = await preloadImages(chapters);

      const docSections = [];

      // --- 1. TITLE PAGE SECTION ---
      docSections.push({
        properties: {
          type: SectionType.NEXT_PAGE,
        },
        children: [
          new Paragraph({
            text: profile.bookTitle || "My Life Story",
            heading: HeadingLevel.TITLE,
            spacing: { after: 300, before: 3000 },
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            text: profile.authorName || "Author Name",
            style: "VellumAuthor",
          })
        ],
      });

      // --- 2. COPYRIGHT PAGE ---
      docSections.push({
        properties: {
          type: SectionType.NEXT_PAGE,
        },
        children: [
          new Paragraph({
            text: "Copyright",
            style: "VellumHiddenHeading"
          }),
          new Paragraph({
            text: "Copyright © " + new Date().getFullYear() + " by The Book of Me Ltd",
            style: "VellumCenteredText"
          }),
          new Paragraph({
            text: "",
            style: "VellumCenteredText"
          }),
          new Paragraph({
            text: "All rights reserved.",
            style: "VellumCenteredText"
          }),
          new Paragraph({
            text: "",
            style: "VellumCenteredText"
          }),
          new Paragraph({
            text: "No part of this book may be reproduced in any form or by any electronic or mechanical means, including information storage and retrieval systems, without written permission from the author, except for the use of brief quotations in a book review.",
            style: "VellumCenteredText"
          }),
          new Paragraph({
            text: "",
            style: "VellumCenteredText"
          }),
          new Paragraph({
            text: "www.bookofme.co.uk",
            style: "VellumCenteredText"
          })
        ]
      });

      // --- 3. DEDICATION PAGE (Optional) ---
      const dedication = profile.dedication;
      if (dedication && dedication.trim().length > 0) {
        docSections.push({
          properties: {
            type: SectionType.NEXT_PAGE,
          },
          children: [
            new Paragraph({
              text: "Dedication",
              style: "VellumHiddenHeading"
            }),
            new Paragraph({
              children: [new TextRun({ text: dedication, italics: true })],
              style: "VellumCenteredText"
            })
          ]
        });
      }

      // --- 4. CHAPTERS ---
      let totalWords = 0;
      let totalImages = 0;

      for (const [index, chapter] of chapters.entries()) {
        const chapterChildren: Paragraph[] = [];

        // Chapter Subtitle (Number)
        chapterChildren.push(
          new Paragraph({
            text: `Chapter ${index + 1}`,
            alignment: AlignmentType.CENTER,
            spacing: { before: 400, after: 100 },
            heading: HeadingLevel.HEADING_3
          })
        );

        // Chapter Title (Heading 1)
        chapterChildren.push(
          new Paragraph({
            text: chapter.title,
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 },
          })
        );

        // Featured Image vs Gallery
        let featuredImage: any = null;
        let galleryImages: any[] = [];

        if (chapter.images && chapter.images.length > 0) {
          featuredImage = chapter.images.find((img: any) => img.isFeatured);
          if (!featuredImage) {
            featuredImage = chapter.images[0];
            galleryImages = chapter.images.slice(1);
          } else {
            galleryImages = chapter.images.filter((img: any) => img.id !== featuredImage.id);
          }
        }

        if (featuredImage) {
          const imgParagraphs = createImageParagraph(featuredImage, 400, false, imageCache);
          chapterChildren.push(...imgParagraphs);
          if (imageCache.has(featuredImage.url)) {
            totalImages++;
          }
        }

        // Content: Normalize breaks
        let processedContent = chapter.content || "";
        
        // Count words in raw content
        const words = processedContent.trim().split(/\s+/).filter((w: string) => w.length > 0).length;
        totalWords += words;

        processedContent = processedContent
          .replace(/<hr\s*\/?>/gi, '___RAW_HR___')
          .replace(/^[ \t]*(- ?){3,}[ \t]*$/gm, '___RAW_HR___')
          .replace(/^[ \t]*(\* ?){3,}[ \t]*$/gm, '___RAW_HR___');

        processedContent = processedContent.replace(/\s*___RAW_HR___\s*/g, '\n___HR_TOKEN___\n');

        const cleanText = processedContent.replace(/<[^>]+>/g, '');
        const rawParagraphs = cleanText.split('\n');

        for (const pText of rawParagraphs) {
          const trimmed = pText.trim();
          if (trimmed.length === 0) continue;

          if (trimmed.includes('___HR_TOKEN___')) {
            chapterChildren.push(
              new Paragraph({
                children: [new TextRun("* * *")],
                alignment: AlignmentType.CENTER,
                spacing: { before: 400, after: 400 }
              })
            );
          } else {
            const isOrnamental = trimmed === '* * *' || trimmed === '***';
            const runChildren = parseMarkdownToTextRuns(trimmed);

            chapterChildren.push(
              new Paragraph({
                children: runChildren,
                spacing: { after: 200 },
                alignment: isOrnamental ? AlignmentType.CENTER : AlignmentType.LEFT
              })
            );
          }
        }

        // Gallery
        if (galleryImages.length > 0) {
          chapterChildren.push(
            new Paragraph({
              text: "Image Gallery",
              style: "VellumHiddenHeading",
              pageBreakBefore: true
            })
          );

          for (const img of galleryImages) {
            const imgData = imageCache.get(img.url);
            if (imgData) {
              totalImages++;
              const scaleFactor = 400 / imgData.width;
              const targetHeight = Math.round(imgData.height * scaleFactor);

              chapterChildren.push(
                new Paragraph({
                  children: [
                    new ImageRun({
                      data: imgData.buffer,
                      transformation: { width: 400, height: targetHeight },
                      type: imgData.type as any
                    })
                  ],
                  style: "VellumInlineImage"
                })
              );

              if (img.caption) {
                chapterChildren.push(
                  new Paragraph({
                    text: img.caption,
                    style: "Caption"
                  })
                );
              }
            }
          }
        }

        docSections.push({
          properties: {
            type: SectionType.NEXT_PAGE,
          },
          children: chapterChildren,
        });
      }

      // 5. Build Document with Vellum styles
      const doc = new Document({
        styles: {
          paragraphStyles: [
            {
              id: "VellumHiddenHeading",
              name: "Vellum Hidden Heading",
              basedOn: "Heading1",
              next: "Normal",
              quickFormat: true,
              run: {
                color: "BFBFBF",
              },
              paragraph: {
                alignment: AlignmentType.CENTER,
                spacing: { after: 1440 },
              },
            },
            {
              id: "VellumCenteredText",
              name: "Vellum Centered Text",
              basedOn: "Normal",
              next: "Normal",
              quickFormat: true,
              paragraph: {
                alignment: AlignmentType.CENTER,
                spacing: { before: 240, after: 240 },
              },
            },
            {
              id: "VellumInlineImage",
              name: "Vellum Inline Image",
              basedOn: "Normal",
              quickFormat: true,
              paragraph: {
                alignment: AlignmentType.CENTER,
                keepNext: true,
                indent: { firstLine: 0 },
              },
            },
            {
              id: "VellumAuthor",
              name: "Vellum Author",
              basedOn: "Normal",
              next: "Normal",
              quickFormat: true,
              paragraph: {
                alignment: AlignmentType.CENTER,
                spacing: { before: 720 },
                indent: { firstLine: 0 },
              },
              run: {
                size: 32,
              }
            },
            {
              id: "Caption",
              name: "Caption",
              basedOn: "Normal",
              next: "Normal",
              quickFormat: true,
              paragraph: {
                alignment: AlignmentType.CENTER,
                spacing: { after: 200 },
              },
              run: {
                italics: true,
                size: 20,
              }
            }
          ],
        },
        sections: docSections,
      });

      // 6. Generate and save locally
      const buffer = await Packer.toBuffer(doc);
      
      const outputDir = path.resolve(process.cwd(), 'output');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const bookTitle = profile.bookTitle || "My Life Story";
      const sanitizedTitle = bookTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const fileName = `${sanitizedTitle}.docx`;
      const filePath = path.join(outputDir, fileName);

      fs.writeFileSync(filePath, buffer);
      console.log(`[manuscriptTools] Successfully wrote compiled manuscript to ${filePath}`);

      const absoluteFilePath = path.resolve(filePath);
      const markdownFileLink = `[Download ${fileName}](file://${absoluteFilePath})`;

      return {
        status: 'success',
        bookTitle,
        authorName: profile.authorName,
        chapterCount: chapters.length,
        wordCount: totalWords,
        imageCount: totalImages,
        filePath: absoluteFilePath,
        message: `✅ Manuscript compiled successfully!

📖 **"${bookTitle}"** by ${profile.authorName || "Author"}
   - ${chapters.length} chapters
   - ${totalWords.toLocaleString()} words
   - ${totalImages} images included

📥 **Get your manuscript**: ${markdownFileLink}

What would you like to do next?
1. 🖨️ **Turn this into a beautiful printed book with Book of Me** (hardcover from £29.99)
2. 📥 **Download/Open the .docx file**`
      };

    } catch (error: any) {
      console.error(`[manuscriptTools] Error compiling manuscript:`, error);
      return {
        status: 'error',
        message: `Failed to compile manuscript: ${error.message}`
      };
    }
  }
});
