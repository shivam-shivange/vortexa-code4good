import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import AdmZip from 'adm-zip';
import { DOMParser } from 'xmldom';

const execAsync = promisify(exec);

class PPTExtractionService {
  constructor() {
    this.tempDir = path.join(process.cwd(), 'temp');
    this.ensureDirectoryExists();
  }

  async ensureDirectoryExists() {
    try {
      await fs.access(this.tempDir);
    } catch {
      await fs.mkdir(this.tempDir, { recursive: true });
    }
  }

  /**
   * Extract text from PowerPoint file
   * @param {string} pptPath - Path to the PPT/PPTX file
   * @returns {Promise<Object>} - Extracted text and metadata
   */
  async extractTextFromPPT(pptPath) {
    try {
      const fileExtension = path.extname(pptPath).toLowerCase();
      
      if (fileExtension === '.pptx') {
        return await this.extractFromPPTX(pptPath);
      } else if (fileExtension === '.ppt') {
        return await this.extractFromPPT(pptPath);
      } else {
        throw new Error('Unsupported file format. Only .ppt and .pptx files are supported.');
      }
    } catch (error) {
      console.error('PPT extraction failed:', error);
      throw new Error(`PPT extraction failed: ${error.message}`);
    }
  }

  /**
   * Extract text from PPTX file (Office Open XML format)
   * @param {string} pptxPath - Path to the PPTX file
   * @returns {Promise<Object>} - Extracted content
   */
  async extractFromPPTX(pptxPath) {
    try {
      const zip = new AdmZip(pptxPath);
      const slides = [];
      let slideNumber = 1;

      // Get all slide entries
      const slideEntries = zip.getEntries().filter(entry => 
        entry.entryName.startsWith('ppt/slides/slide') && 
        entry.entryName.endsWith('.xml')
      );

      // Sort slides by number
      slideEntries.sort((a, b) => {
        const aNum = parseInt(a.entryName.match(/slide(\d+)\.xml/)[1]);
        const bNum = parseInt(b.entryName.match(/slide(\d+)\.xml/)[1]);
        return aNum - bNum;
      });

      for (const entry of slideEntries) {
        try {
          const slideXml = entry.getData().toString('utf8');
          const slideText = this.extractTextFromSlideXML(slideXml);
          
          if (slideText.trim()) {
            slides.push({
              slideNumber: slideNumber,
              title: this.extractSlideTitle(slideXml) || `Slide ${slideNumber}`,
              content: slideText,
              wordCount: slideText.split(/\s+/).length
            });
          }
          slideNumber++;
        } catch (slideError) {
          console.error(`Error processing slide ${slideNumber}:`, slideError);
          slideNumber++;
        }
      }

      // Extract notes if available
      const notes = await this.extractNotesFromPPTX(zip);

      return {
        success: true,
        slides: slides,
        notes: notes,
        metadata: {
          fileName: path.basename(pptxPath),
          totalSlides: slides.length,
          totalWords: slides.reduce((sum, slide) => sum + slide.wordCount, 0),
          extractedAt: new Date().toISOString(),
          format: 'pptx'
        }
      };

    } catch (error) {
      console.error('PPTX extraction error:', error);
      throw new Error(`PPTX extraction failed: ${error.message}`);
    }
  }

  /**
   * Extract text from PPT file (legacy format)
   * @param {string} pptPath - Path to the PPT file
   * @returns {Promise<Object>} - Extracted content
   */
  async extractFromPPT(pptPath) {
    try {
      // For legacy PPT files, we'll use a different approach
      // This is a simplified version - in production, you might want to use
      // a more robust solution like python-pptx via child process
      
      console.log('Legacy PPT format detected. Using alternative extraction method...');
      
      // Try to use LibreOffice to convert to text if available
      const textContent = await this.convertPPTToText(pptPath);
      
      return {
        success: true,
        slides: [{
          slideNumber: 1,
          title: 'Extracted Content',
          content: textContent,
          wordCount: textContent.split(/\s+/).length
        }],
        notes: [],
        metadata: {
          fileName: path.basename(pptPath),
          totalSlides: 1,
          totalWords: textContent.split(/\s+/).length,
          extractedAt: new Date().toISOString(),
          format: 'ppt',
          note: 'Legacy format - content may be combined'
        }
      };

    } catch (error) {
      console.error('PPT extraction error:', error);
      throw new Error(`PPT extraction failed: ${error.message}`);
    }
  }

  /**
   * Extract text content from slide XML
   * @param {string} slideXml - XML content of the slide
   * @returns {string} - Extracted text
   */
  extractTextFromSlideXML(slideXml) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(slideXml, 'text/xml');
      
      // Find all text elements
      const textElements = this.getElementsByTagName(doc, 'a:t');
      const textContent = [];
      
      for (let i = 0; i < textElements.length; i++) {
        const element = textElements[i];
        if (element.textContent) {
          textContent.push(element.textContent.trim());
        }
      }
      
      return textContent.join(' ').replace(/\s+/g, ' ').trim();
    } catch (error) {
      console.error('Error extracting text from slide XML:', error);
      return '';
    }
  }

  /**
   * Extract slide title from XML
   * @param {string} slideXml - XML content of the slide
   * @returns {string} - Slide title
   */
  extractSlideTitle(slideXml) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(slideXml, 'text/xml');
      
      // Look for title placeholder
      const titleElements = this.getElementsByTagName(doc, 'p:ph');
      
      for (let i = 0; i < titleElements.length; i++) {
        const element = titleElements[i];
        const type = element.getAttribute('type');
        
        if (type === 'title' || type === 'ctrTitle') {
          // Find the parent shape and extract text
          let parent = element.parentNode;
          while (parent && parent.nodeName !== 'p:sp') {
            parent = parent.parentNode;
          }
          
          if (parent) {
            const textElements = this.getElementsByTagName(parent, 'a:t');
            const titleText = [];
            
            for (let j = 0; j < textElements.length; j++) {
              if (textElements[j].textContent) {
                titleText.push(textElements[j].textContent.trim());
              }
            }
            
            if (titleText.length > 0) {
              return titleText.join(' ').trim();
            }
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error extracting slide title:', error);
      return null;
    }
  }

  /**
   * Extract notes from PPTX
   * @param {AdmZip} zip - ZIP archive of PPTX file
   * @returns {Promise<Array>} - Array of notes
   */
  async extractNotesFromPPTX(zip) {
    const notes = [];
    
    try {
      const noteEntries = zip.getEntries().filter(entry => 
        entry.entryName.startsWith('ppt/notesSlides/notesSlide') && 
        entry.entryName.endsWith('.xml')
      );

      for (const entry of noteEntries) {
        try {
          const noteXml = entry.getData().toString('utf8');
          const noteText = this.extractTextFromSlideXML(noteXml);
          
          if (noteText.trim()) {
            const slideNumber = parseInt(entry.entryName.match(/notesSlide(\d+)\.xml/)[1]);
            notes.push({
              slideNumber: slideNumber,
              content: noteText
            });
          }
        } catch (noteError) {
          console.error('Error processing note:', noteError);
        }
      }
    } catch (error) {
      console.error('Error extracting notes:', error);
    }
    
    return notes;
  }

  /**
   * Convert PPT to text using external tools
   * @param {string} pptPath - Path to PPT file
   * @returns {Promise<string>} - Extracted text
   */
  async convertPPTToText(pptPath) {
    try {
      // Try LibreOffice conversion
      const tempTextFile = path.join(this.tempDir, `${Date.now()}.txt`);
      
      const command = `libreoffice --headless --convert-to txt --outdir "${this.tempDir}" "${pptPath}"`;
      
      await execAsync(command);
      
      // Read the converted text file
      const textContent = await fs.readFile(tempTextFile, 'utf8');
      
      // Clean up temp file
      await fs.unlink(tempTextFile).catch(() => {});
      
      return textContent;
    } catch (error) {
      console.error('LibreOffice conversion failed:', error);
      
      // Fallback: return a message indicating manual processing needed
      return 'Unable to extract text from legacy PPT format automatically. Please convert to PPTX format for better text extraction.';
    }
  }

  /**
   * Helper function to get elements by tag name (cross-browser compatible)
   * @param {Document|Element} element - DOM element or document
   * @param {string} tagName - Tag name to search for
   * @returns {NodeList} - Found elements
   */
  getElementsByTagName(element, tagName) {
    if (element.getElementsByTagName) {
      return element.getElementsByTagName(tagName);
    }
    
    // Fallback for basic XML parsing
    const elements = [];
    const walker = element.childNodes;
    
    for (let i = 0; i < walker.length; i++) {
      const node = walker[i];
      if (node.nodeName === tagName) {
        elements.push(node);
      }
      
      if (node.childNodes && node.childNodes.length > 0) {
        const childElements = this.getElementsByTagName(node, tagName);
        for (let j = 0; j < childElements.length; j++) {
          elements.push(childElements[j]);
        }
      }
    }
    
    return elements;
  }

  /**
   * Clean up temporary files
   * @param {Array} filePaths - Array of file paths to clean up
   */
  async cleanupTempFiles(filePaths) {
    for (const filePath of filePaths) {
      try {
        await fs.unlink(filePath);
        console.log(`Cleaned up temp file: ${filePath}`);
      } catch (error) {
        console.error(`Failed to cleanup temp file ${filePath}:`, error);
      }
    }
  }
}

export default new PPTExtractionService();
