import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure upload directories exist
const ensureUploadDirs = async () => {
  const dirs = [
    path.join(__dirname, '../uploads'),
    path.join(__dirname, '../uploads/videos'),
    path.join(__dirname, '../uploads/presentations'),
    path.join(__dirname, '../uploads/audio'),
    path.join(__dirname, '../uploads/temp')
  ];

  for (const dir of dirs) {
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
      console.log(`Created upload directory: ${dir}`);
    }
  }
};

// Initialize upload directories
ensureUploadDirs();

// Storage config: organize files by type
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadPath = 'uploads/';
    
    if (file.fieldname === 'video') {
      uploadPath = 'uploads/videos/';
    } else if (file.fieldname === 'ppt') {
      uploadPath = 'uploads/presentations/';
    }
    
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Sanitize filename and append timestamp
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9.-]/g, '_') // Replace special chars with underscore
      .substring(0, 50); // Limit length
    
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    
    cb(null, `${name}-${timestamp}-${randomSuffix}${ext}`);
  }
});

// Enhanced file filter with detailed validation
const fileFilter = (req, file, cb) => {
  const videoMimeTypes = [
    'video/mp4',
    'video/mpeg',
    'video/quicktime',
    'video/x-msvideo', // .avi
    'video/x-ms-wmv',  // .wmv
    'video/webm'
  ];

  const videoExtensions = ['.mp4', '.mpeg', '.mpg', '.mov', '.avi', '.wmv', '.webm'];

  const presentationMimeTypes = [
    'application/vnd.ms-powerpoint', // .ppt
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
    'application/pdf' // Allow PDF as well
  ];

  const presentationExtensions = ['.ppt', '.pptx', '.pdf'];

  const fileExt = path.extname(file.originalname).toLowerCase();
  
  if (file.fieldname === 'video') {
    if (videoMimeTypes.includes(file.mimetype) && videoExtensions.includes(fileExt)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid video file. Allowed formats: ${videoExtensions.join(', ')}`), false);
    }
  } else if (file.fieldname === 'ppt') {
    if (presentationMimeTypes.includes(file.mimetype) && presentationExtensions.includes(fileExt)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid presentation file. Allowed formats: ${presentationExtensions.join(', ')}`), false);
    }
  } else {
    cb(new Error('Unexpected field name'), false);
  }
};

// File size limits by type
const limits = {
  fileSize: (req, file) => {
    if (file.fieldname === 'video') {
      return 5 * 1024 * 1024 * 1024; // 5GB for videos
    } else if (file.fieldname === 'ppt') {
      return 100 * 1024 * 1024; // 100MB for presentations
    }
    return 10 * 1024 * 1024; // 10MB default
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { 
    fileSize: 5 * 1024 * 1024 * 1024, // 5GB max (will be checked per field in middleware)
    files: 2, // Maximum 2 files (video + ppt)
    fields: 10, // Maximum 10 fields
    fieldNameSize: 50, // Maximum field name size
    fieldSize: 1024 * 1024 // Maximum field value size (1MB)
  }
});

// Custom middleware to check file sizes per field
export const validateFileSize = (req, res, next) => {
  if (req.files) {
    for (const fieldname in req.files) {
      const files = req.files[fieldname];
      
      for (const file of files) {
        let maxSize;
        
        if (fieldname === 'video') {
          maxSize = 5 * 1024 * 1024 * 1024; // 5GB
        } else if (fieldname === 'ppt') {
          maxSize = 100 * 1024 * 1024; // 100MB
        } else {
          maxSize = 10 * 1024 * 1024; // 10MB
        }
        
        if (file.size > maxSize) {
          return res.status(400).json({
            error: `File ${file.originalname} is too large. Maximum size for ${fieldname}: ${Math.round(maxSize / 1024 / 1024)}MB`
          });
        }
      }
    }
  }
  
  next();
};

// Middleware to validate file content (basic magic number check)
export const validateFileContent = async (req, res, next) => {
  if (!req.files) {
    return next();
  }

  try {
    for (const fieldname in req.files) {
      const files = req.files[fieldname];
      
      for (const file of files) {
        const buffer = await fs.readFile(file.path);
        const isValid = await validateFileSignature(buffer, file.mimetype, fieldname);
        
        if (!isValid) {
          // Clean up uploaded file
          await fs.unlink(file.path).catch(() => {});
          
          return res.status(400).json({
            error: `File ${file.originalname} appears to be corrupted or has an invalid format`
          });
        }
      }
    }
    
    next();
  } catch (error) {
    console.error('File content validation error:', error);
    next(); // Continue on validation error to avoid blocking uploads
  }
};

// Validate file signature (magic numbers)
const validateFileSignature = async (buffer, mimetype, fieldname) => {
  if (buffer.length < 4) return false;

  const signatures = {
    // Video signatures
    'video/mp4': [
      [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70], // MP4
      [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70], // MP4
    ],
    'video/avi': [[0x52, 0x49, 0x46, 0x46]], // AVI
    'video/quicktime': [[0x00, 0x00, 0x00, 0x14, 0x66, 0x74, 0x79, 0x70]], // MOV
    
    // Presentation signatures
    'application/vnd.ms-powerpoint': [[0xD0, 0xCF, 0x11, 0xE0]], // PPT
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': [
      [0x50, 0x4B, 0x03, 0x04], // PPTX (ZIP-based)
      [0x50, 0x4B, 0x05, 0x06], // PPTX (ZIP-based)
      [0x50, 0x4B, 0x07, 0x08]  // PPTX (ZIP-based)
    ],
    'application/pdf': [[0x25, 0x50, 0x44, 0x46]] // PDF
  };

  const expectedSignatures = signatures[mimetype];
  if (!expectedSignatures) return true; // Allow unknown types

  return expectedSignatures.some(signature => {
    return signature.every((byte, index) => buffer[index] === byte);
  });
};

// Cleanup middleware to remove files on error
export const cleanupOnError = (error, req, res, next) => {
  if (req.files) {
    // Clean up uploaded files if there was an error
    const cleanupPromises = [];
    
    for (const fieldname in req.files) {
      const files = req.files[fieldname];
      for (const file of files) {
        cleanupPromises.push(
          fs.unlink(file.path).catch(err => 
            console.error(`Failed to cleanup file ${file.path}:`, err)
          )
        );
      }
    }
    
    Promise.all(cleanupPromises).then(() => {
      next(error);
    });
  } else {
    next(error);
  }
};

export default upload;
