# Learning App Backend

A comprehensive backend service for processing educational content with AI-powered transcription, summarization, and quiz generation.

## Features

### 🎥 Content Processing
- **Video Upload & Processing**: Support for MP4, AVI, MOV, WebM formats (up to 5GB)
- **Audio Extraction**: Automatic audio extraction using FFmpeg
- **Multi-service Transcription**: 
  - Gemini API (Google AI) with Files API
  - OpenAI Whisper (fallback/alternative)
  - Automatic service selection with circuit breakers
- **PPT Text Extraction**: Support for .ppt, .pptx, and .pdf files

### 🤖 AI-Powered Features
- **Summarization**: Multiple styles (concise, detailed, exam-prep)
- **Quiz Generation**: MCQ and short-answer questions with explanations
- **Multi-language Support**: Generate content in multiple languages
- **Translation**: Translate content between languages

### 📊 Analytics & Reporting
- **xAPI Event Logging**: Learning analytics with xAPI standard
- **Performance Reports**: Engagement metrics, quiz performance, learning progress
- **ETL Pipeline**: Automated data processing and aggregation
- **Dashboard Analytics**: Real-time insights and trends

### 🔒 Security & Performance
- **Rate Limiting**: IP and user-based rate limiting
- **File Validation**: Content-type and magic number validation
- **Circuit Breakers**: Fault tolerance for external services
- **Caching**: Redis-like caching with PostgreSQL backend
- **Authentication**: JWT-based auth with role-based access

## Quick Start

### Prerequisites

- Node.js 18+ 
- PostgreSQL 12+
- FFmpeg (included via ffmpeg-static)

### Installation

1. **Clone and install dependencies**
```bash
cd Backend
npm install
```

2. **Set up environment variables**
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Set up database**
```bash
# Create PostgreSQL database
createdb learningapp

# Run schema
psql -d learningapp -f database/schema.sql
```

4. **Start the server**
```bash
npm start
```

The server will start on `http://localhost:5000`

## API Endpoints

### Authentication
- `POST /api/auth/signup` - User registration
- `POST /api/auth/login` - User login

### Lectures
- `POST /api/lectures/upload` - Upload video + optional PPT
- `GET /api/lectures` - List lectures (paginated)
- `GET /api/lectures/:id` - Get lecture details
- `GET /api/lectures/:id/summary` - Get/generate summary
- `GET /api/lectures/:id/quiz` - Get/generate quiz
- `GET /api/lectures/:id/status` - Get processing status
- `POST /api/lectures/:id/reprocess` - Reprocess lecture
- `DELETE /api/lectures/:id` - Delete lecture

### Reports & Analytics
- `GET /api/reports/dashboard` - Dashboard summary
- `GET /api/reports/engagement` - Engagement analytics
- `GET /api/reports/quiz-performance` - Quiz performance metrics
- `GET /api/reports/learning-progress` - Learning progress tracking
- `GET /api/reports/top-content` - Top performing content
- `GET /api/reports/users/:id/performance` - User performance
- `GET /api/reports/export` - Export analytics (CSV/JSON)

### System
- `GET /health` - Health check
- `GET /api/reports/etl/status` - ETL pipeline status (admin)
- `POST /api/reports/etl/trigger` - Trigger ETL manually (admin)

## Configuration

### Required Environment Variables

```bash
# Database
DB_HOST=localhost
DB_NAME=learningapp
DB_USER=postgres
DB_PASS=your_password

# AI Services
GEMINI_API_KEY=your_gemini_api_key
OPENAI_API_KEY=your_openai_api_key  # Optional

# JWT
JWT_SECRET=your_jwt_secret
```

### AI Service Configuration

The system supports multiple transcription services:

1. **Gemini (Google AI)** - Primary service
   - Requires `GEMINI_API_KEY`
   - Uses Files API for large audio files
   - Supports multiple languages

2. **OpenAI Whisper** - Fallback service
   - Requires `OPENAI_API_KEY`
   - 25MB file size limit
   - Excellent accuracy

Set `TRANSCRIPTION_SERVICE` to:
- `auto` - Prefer Whisper, fallback to Gemini
- `gemini` - Prefer Gemini, fallback to Whisper  
- `whisper` - Prefer Whisper, fallback to Gemini

## Usage Examples

### Upload a Lecture

```bash
curl -X POST http://localhost:5000/api/lectures/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "title=Introduction to AI" \
  -F "description=Basic AI concepts" \
  -F "language=en" \
  -F "video=@lecture.mp4" \
  -F "ppt=@slides.pptx"
```

### Get Summary

```bash
curl "http://localhost:5000/api/lectures/123/summary?lang=en&style=detailed" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Get Quiz

```bash
curl "http://localhost:5000/api/lectures/123/quiz?lang=en&difficulty=medium" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Get Analytics

```bash
curl "http://localhost:5000/api/reports/engagement?startDate=2024-01-01&endDate=2024-12-31" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Architecture

### Services
- **Enhanced Ingestion Service**: Orchestrates the complete processing pipeline
- **Audio Extraction Service**: FFmpeg-based audio extraction
- **Gemini Files Service**: Google AI integration with Files API
- **Whisper Service**: OpenAI Whisper integration
- **PPT Extraction Service**: PowerPoint text extraction
- **Reports Service**: Analytics and ETL pipeline
- **Cache Service**: Performance optimization

### Middleware
- **Rate Limiting**: Multiple rate limiters with circuit breakers
- **xAPI Middleware**: Learning analytics event logging
- **File Validation**: Content-type and signature validation
- **Authentication**: JWT-based auth with role checking

### Database Schema
- **Users**: User accounts and roles
- **Lectures**: Video lectures and metadata
- **Transcript Chunks**: Segmented transcriptions
- **Summaries**: AI-generated summaries
- **Quizzes**: AI-generated quizzes and attempts
- **Events**: xAPI learning events
- **Reports Tables**: Aggregated analytics data

## Development

### File Structure
```
Backend/
├── controllers/     # Request handlers
├── middleware/      # Express middleware
├── routes/         # API route definitions
├── services/       # Business logic services
├── utils/          # Utility functions
├── database/       # Database schema and migrations
├── uploads/        # File storage (videos, audio, presentations)
└── logs/          # Application logs
```

### Adding New Features

1. **New AI Service**: Implement in `services/` following the existing pattern
2. **New Analytics**: Add to `services/reportsService.js` and create controller
3. **New Endpoints**: Add route in `routes/` and controller in `controllers/`

### Testing

```bash
# Run health check
curl http://localhost:5000/health

# Check service status
curl http://localhost:5000/api/reports/etl/status \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

## Production Deployment

### Environment Setup
1. Set `NODE_ENV=production`
2. Use strong JWT secrets
3. Configure proper database credentials
4. Set up SSL/TLS termination
5. Configure CORS for your domain

### Scaling Considerations
- Use Redis for caching instead of PostgreSQL
- Implement file storage with S3/GCS
- Add load balancing for multiple instances
- Consider separating AI processing to worker queues

### Monitoring
- Health check endpoint: `/health`
- ETL status: `/api/reports/etl/status`
- Rate limit tables for abuse detection
- Application logs in `logs/` directory

## Troubleshooting

### Common Issues

1. **FFmpeg not found**
   - The app includes `ffmpeg-static`, no system install needed
   - Check console for FFmpeg path detection

2. **AI service failures**
   - Check API keys in environment variables
   - Monitor circuit breaker status in health endpoint
   - Review rate limiting settings

3. **File upload failures**
   - Check file size limits in configuration
   - Verify file type validation
   - Ensure upload directories exist

4. **Database connection issues**
   - Verify PostgreSQL is running
   - Check database credentials
   - Ensure schema is applied

### Logs and Debugging

- Application logs: Check console output
- Database queries: Set `ENABLE_SQL_LOGGING=true`
- Request logging: Set `ENABLE_REQUEST_LOGGING=true`
- Debug mode: Set `DEBUG_MODE=true`

## API Rate Limits

- **Authentication**: 5 attempts per 15 minutes per IP
- **File Uploads**: 10 uploads per hour per IP, 5 per hour per user
- **AI Services**: 50 requests per hour per IP, 30 per hour per user
- **Reports**: 20 requests per 5 minutes per IP
- **General**: 100 requests per 15 minutes per IP

## License

This project is licensed under the ISC License.

## Support

For issues and questions:
1. Check this README
2. Review the `.env.example` configuration
3. Check application logs
4. Verify API key configuration
