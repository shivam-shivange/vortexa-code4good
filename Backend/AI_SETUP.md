# AI Features Setup Guide

This guide explains how to set up and test the AI-powered features in LearningApp: ASR (Automatic Speech Recognition), Segmentation, Summarization, and Quiz Generation.

## 🔧 Prerequisites

### 1. API Keys Required
- **Gemini API Key**: Required for summarization and quiz generation
- **OpenAI API Key**: Optional, for Whisper ASR service

### 2. Environment Configuration
Update your `.env` file with the following:

```env
# AI Services Configuration
GEMINI_API_KEY=your_gemini_api_key_here
OPENAI_API_KEY=your_openai_api_key_here  # Optional

# Transcription Service Preference
TRANSCRIPTION_SERVICE=gemini  # Options: auto, gemini, whisper
```

## 🚀 Quick Setup for Testing

### Step 1: Add Test Data
Run the following command to add test transcript data for demonstration:

```bash
node add-test-data.js
```

This will:
- Add sample transcript chunks for lecture ID 2
- Create a test lecture if it doesn't exist
- Enable summary and quiz generation for testing

### Step 2: Restart Backend
```bash
npm run dev
```

### Step 3: Test Features
1. Open the frontend at `http://localhost:3000`
2. Login/signup to access the dashboard
3. Click on lecture ID 2
4. Try generating summaries and quizzes

## 🎯 Feature Overview

### 1. ASR (Automatic Speech Recognition)
- **Purpose**: Convert audio from videos to text transcripts
- **Services**: Gemini Audio API or OpenAI Whisper
- **Configuration**: Set `TRANSCRIPTION_SERVICE` in `.env`

### 2. Segmentation
- **Purpose**: Break down transcripts into meaningful chunks
- **Implementation**: Time-based segmentation with speaker detection
- **Database**: Stored in `transcript_chunks` table

### 3. Summarization
- **Purpose**: Generate AI-powered summaries from transcripts
- **Service**: Google Gemini 1.5 Flash
- **Features**: 
  - Multiple styles (concise, detailed, bullet points)
  - Multi-language support
  - Caching for performance

### 4. Quiz Generation
- **Purpose**: Create interactive quizzes from lecture content
- **Service**: Google Gemini 1.5 Flash
- **Features**:
  - Multiple difficulty levels
  - Various question types (MCQ, short answer)
  - Explanations for answers

## 📊 Database Schema

### Transcript Chunks
```sql
CREATE TABLE transcript_chunks (
    id SERIAL PRIMARY KEY,
    lecture_id INTEGER REFERENCES lectures(id),
    start_ts DECIMAL NOT NULL,
    end_ts DECIMAL NOT NULL,
    text TEXT NOT NULL,
    confidence DECIMAL,
    speaker_id VARCHAR(50)
);
```

### Summaries
```sql
CREATE TABLE summaries (
    id SERIAL PRIMARY KEY,
    lecture_id INTEGER REFERENCES lectures(id),
    lang VARCHAR(10) DEFAULT 'en',
    style VARCHAR(50) DEFAULT 'concise',
    content_md TEXT NOT NULL,
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Quizzes
```sql
CREATE TABLE quizzes (
    id SERIAL PRIMARY KEY,
    lecture_id INTEGER REFERENCES lectures(id),
    lang VARCHAR(10) DEFAULT 'en',
    difficulty VARCHAR(20) DEFAULT 'medium',
    items_json JSONB NOT NULL,
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 🔄 Processing Pipeline

### Video Upload Process
1. **Upload**: User uploads video + optional PPT
2. **Audio Extraction**: Extract audio from video using FFmpeg
3. **ASR**: Convert audio to text using Gemini/Whisper
4. **Segmentation**: Break transcript into chunks
5. **Storage**: Save chunks to database
6. **Status Update**: Mark lecture as "completed"

### On-Demand Generation
1. **Summary Request**: User clicks "Generate Summary"
2. **Transcript Retrieval**: Fetch all chunks for lecture
3. **AI Processing**: Send to Gemini for summarization
4. **Caching**: Store result for future requests
5. **Display**: Show formatted summary to user

## 🛠️ API Endpoints

### Summary Generation
```
GET /api/lectures/:id/summary?lang=en&style=detailed&regenerate=false
```

### Quiz Generation
```
GET /api/lectures/:id/quiz?lang=en&difficulty=medium&regenerate=false
```

### Lecture Details
```
GET /api/lectures/:id
```
Returns lecture with transcript, summaries, and quizzes.

## 🧪 Testing

### Test Summary Generation
```bash
curl "http://localhost:5000/api/lectures/2/summary?style=detailed" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Test Quiz Generation
```bash
curl "http://localhost:5000/api/lectures/2/quiz?difficulty=medium" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 🐛 Troubleshooting

### Common Issues

1. **"No transcript chunks found"**
   - Run `node add-test-data.js` to add test data
   - Or upload a new video to trigger ASR processing

2. **"GEMINI_API_KEY not found"**
   - Add your Gemini API key to `.env`
   - Restart the backend server

3. **"[object Object]" in summary**
   - Frontend display issue - refresh the page
   - Check browser console for detailed errors

4. **Quiz shows no questions**
   - Check if `items_json` contains valid JSON
   - Verify Gemini API is responding correctly

### Debug Mode
Enable detailed logging by setting:
```env
DEBUG_MODE=true
ENABLE_REQUEST_LOGGING=true
```

## 📈 Performance Optimization

### Caching Strategy
- **Summaries**: Cached by lecture_id + language + style
- **Quizzes**: Cached by lecture_id + language + difficulty
- **Transcripts**: Permanent storage, no expiration

### Rate Limiting
- **Gemini API**: Circuit breaker pattern implemented
- **User Requests**: Rate limited per user and IP
- **Retry Logic**: Automatic retry with exponential backoff

## 🔮 Future Enhancements

1. **Advanced Segmentation**: Topic-based segmentation
2. **Speaker Diarization**: Identify different speakers
3. **Visual Analysis**: Extract text from presentation slides
4. **Multi-modal Summaries**: Combine audio and visual content
5. **Adaptive Quizzes**: Difficulty adjustment based on performance

## 📞 Support

If you encounter issues:
1. Check the console logs for detailed error messages
2. Verify API keys are correctly configured
3. Ensure database tables exist and have proper permissions
4. Test with the provided sample data first

For development questions, check the main README.md file.
