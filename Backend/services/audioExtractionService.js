import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import ffprobePath from 'ffprobe-static';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class AudioExtractionService {
  constructor() {
    // Ensure audio output directory exists
    this.audioDir = path.join(__dirname, '../../uploads/audio');
    this.ensureDirectoryExists();

    // Wire up static binaries so FFmpeg works without system install
    if (ffmpegPath) {
      ffmpeg.setFfmpegPath(ffmpegPath);
    }
    if (ffprobePath && ffprobePath.path) {
      ffmpeg.setFfprobePath(ffprobePath.path);
    }
  }

  async ensureDirectoryExists() {
    try {
      await fs.access(this.audioDir);
    } catch {
      await fs.mkdir(this.audioDir, { recursive: true });
    }
  }

  /**
   * Extract audio from video file
   * @param {string} videoPath - Path to the video file
   * @param {Object} options - Extraction options
   * @returns {Promise<Object>} - Result with audio path and metadata
   */
  async extractAudio(videoPath, options = {}) {
    const {
      format = 'mp3',
      quality = '192k',
      channels = 1, // mono for better transcription
      sampleRate = 16000 // 16kHz for speech recognition
    } = options;

    try {
      // Generate unique filename for audio
      const videoBasename = path.basename(videoPath, path.extname(videoPath));
      const audioFilename = `${videoBasename}-${Date.now()}.${format}`;
      const audioPath = path.join(this.audioDir, audioFilename);

      // Get video metadata first
      const metadata = await this.getVideoMetadata(videoPath);

      return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
          .audioCodec('libmp3lame')
          .audioBitrate(quality)
          .audioChannels(channels)
          .audioFrequency(sampleRate)
          .format(format)
          .on('start', (commandLine) => {
            console.log('FFmpeg process started:', commandLine);
          })
          .on('progress', (progress) => {
            console.log(`Audio extraction progress: ${Math.round(progress.percent || 0)}%`);
          })
          .on('end', () => {
            console.log('Audio extraction completed successfully');
            resolve({
              success: true,
              audioPath: audioPath,
              relativePath: path.relative(path.join(__dirname, '../..'), audioPath),
              metadata: {
                duration: metadata.duration,
                format: format,
                quality: quality,
                channels: channels,
                sampleRate: sampleRate,
                size: null // Will be set after file creation
              }
            });
          })
          .on('error', (err) => {
            console.error('Audio extraction failed:', err);
            reject({
              success: false,
              error: err.message,
              code: 'AUDIO_EXTRACTION_FAILED'
            });
          })
          .save(audioPath);
      });
    } catch (error) {
      console.error('Audio extraction service error:', error);
      throw {
        success: false,
        error: error.message,
        code: 'AUDIO_EXTRACTION_SERVICE_ERROR'
      };
    }
  }

  /**
   * Get video metadata
   * @param {string} videoPath - Path to the video file
   * @returns {Promise<Object>} - Video metadata
   */
  async getVideoMetadata(videoPath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }

        const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
        const audioStream = metadata.streams.find(stream => stream.codec_type === 'audio');

        resolve({
          duration: metadata.format.duration,
          size: metadata.format.size,
          bitrate: metadata.format.bit_rate,
          video: videoStream ? {
            codec: videoStream.codec_name,
            width: videoStream.width,
            height: videoStream.height,
            fps: eval(videoStream.r_frame_rate) // Convert fraction to decimal
          } : null,
          audio: audioStream ? {
            codec: audioStream.codec_name,
            channels: audioStream.channels,
            sampleRate: audioStream.sample_rate,
            bitrate: audioStream.bit_rate
          } : null
        });
      });
    });
  }

  /**
   * Extract audio with timestamps for chunking
   * @param {string} videoPath - Path to the video file
   * @param {Array} timeRanges - Array of {start, end} time ranges in seconds
   * @returns {Promise<Array>} - Array of audio chunk paths
   */
  async extractAudioChunks(videoPath, timeRanges) {
    const chunks = [];
    
    for (let i = 0; i < timeRanges.length; i++) {
      const { start, end } = timeRanges[i];
      const videoBasename = path.basename(videoPath, path.extname(videoPath));
      const chunkFilename = `${videoBasename}-chunk-${i}-${Date.now()}.mp3`;
      const chunkPath = path.join(this.audioDir, chunkFilename);

      try {
        await new Promise((resolve, reject) => {
          ffmpeg(videoPath)
            .seekInput(start)
            .duration(end - start)
            .audioCodec('libmp3lame')
            .audioBitrate('192k')
            .audioChannels(1)
            .audioFrequency(16000)
            .format('mp3')
            .on('end', resolve)
            .on('error', reject)
            .save(chunkPath);
        });

        chunks.push({
          path: chunkPath,
          relativePath: path.relative(path.join(__dirname, '../..'), chunkPath),
          start,
          end,
          duration: end - start
        });
      } catch (error) {
        console.error(`Failed to extract chunk ${i}:`, error);
        // Continue with other chunks
      }
    }

    return chunks;
  }

  /**
   * Clean up audio files
   * @param {string|Array} audioPaths - Path(s) to audio files to delete
   */
  async cleanupAudioFiles(audioPaths) {
    const paths = Array.isArray(audioPaths) ? audioPaths : [audioPaths];
    
    for (const audioPath of paths) {
      try {
        await fs.unlink(audioPath);
        console.log(`Cleaned up audio file: ${audioPath}`);
      } catch (error) {
        console.error(`Failed to cleanup audio file ${audioPath}:`, error);
      }
    }
  }

  /**
   * Get audio file info
   * @param {string} audioPath - Path to audio file
   * @returns {Promise<Object>} - Audio file information
   */
  async getAudioInfo(audioPath) {
    try {
      const stats = await fs.stat(audioPath);
      const metadata = await this.getVideoMetadata(audioPath);
      
      return {
        path: audioPath,
        size: stats.size,
        duration: metadata.duration,
        created: stats.birthtime,
        modified: stats.mtime
      };
    } catch (error) {
      throw new Error(`Failed to get audio info: ${error.message}`);
    }
  }
}

export default new AudioExtractionService();
