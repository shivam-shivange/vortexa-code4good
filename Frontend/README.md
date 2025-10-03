# LearningApp Frontend

A modern, responsive frontend for the LearningApp - Smart Video Learning Platform built with vanilla HTML, CSS, and JavaScript.

## 🚀 Features

### Core Features
- **User Authentication** - Secure login and registration system
- **Video Upload** - Drag-and-drop video and presentation upload
- **AI-Powered Summaries** - Generate intelligent summaries from lectures
- **Interactive Quizzes** - Create and take quizzes based on video content
- **Dashboard** - Comprehensive learning management dashboard
- **Responsive Design** - Works seamlessly on desktop, tablet, and mobile

### UI/UX Features
- **Modern Design** - Clean, intuitive interface with smooth animations
- **Dark Mode Support** - Automatic dark mode based on system preference
- **Toast Notifications** - Real-time feedback for user actions
- **Loading States** - Smooth loading indicators and progress bars
- **Error Handling** - Graceful error handling with user-friendly messages
- **Keyboard Shortcuts** - Productivity shortcuts for power users
- **Offline Detection** - Handles offline scenarios gracefully

## 📁 Project Structure

```
Frontend/
├── index.html              # Main HTML file
├── css/
│   ├── styles.css          # Main styles and variables
│   ├── components.css      # Component-specific styles
│   └── responsive.css      # Responsive design and media queries
├── js/
│   ├── config.js          # Application configuration
│   ├── utils.js           # Utility functions
│   ├── api.js             # API service layer
│   ├── auth.js            # Authentication management
│   ├── lectures.js        # Lecture management
│   ├── upload.js          # File upload handling
│   ├── ui.js              # UI management
│   └── app.js             # Main application entry point
├── package.json           # Project dependencies and scripts
└── README.md             # This file
```

## 🛠️ Installation

### Prerequisites
- Node.js 14+ (for development tools)
- Modern web browser (Chrome, Firefox, Safari, Edge)

### Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/learningapp.git
   cd learningapp/Frontend
   ```

2. Install development dependencies (optional):
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open your browser and navigate to `http://localhost:3000`

### Alternative Setup (No Node.js required)
Simply open `index.html` in your web browser. For full functionality, you'll need to serve it through a web server due to CORS restrictions.

## 🔧 Configuration

### API Configuration
Update the API base URL in `js/config.js`:

```javascript
const CONFIG = {
    API_BASE_URL: 'http://localhost:5000/api', // Change this to your backend URL
    // ... other configuration
};
```

### Environment-Specific Settings
The application automatically detects the environment:
- **Development**: `localhost` or `127.0.0.1`
- **Production**: Any other domain

## 📱 Browser Support

- **Chrome** 90+
- **Firefox** 88+
- **Safari** 14+
- **Edge** 90+

## 🎨 Customization

### Theming
The application uses CSS custom properties for easy theming. Modify the variables in `css/styles.css`:

```css
:root {
    --primary-color: #6366f1;
    --primary-dark: #4f46e5;
    /* ... other variables */
}
```

### Components
All UI components are modular and can be easily customized by modifying their respective CSS classes in `css/components.css`.

## 🚀 Deployment

### Static Hosting
The frontend is a static application and can be deployed to any static hosting service:

- **Netlify**: Drag and drop the Frontend folder
- **Vercel**: Connect your GitHub repository
- **GitHub Pages**: Enable Pages in repository settings
- **AWS S3**: Upload files to S3 bucket with static hosting enabled

### Build Process
No build process is required as this is a vanilla JavaScript application. Simply upload all files to your hosting service.

## 📖 API Integration

The frontend communicates with the backend through RESTful APIs. Key endpoints:

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/signup` - User registration

### Lectures
- `GET /api/lectures` - Get user's lectures
- `POST /api/lectures/upload` - Upload new lecture
- `GET /api/lectures/:id` - Get specific lecture
- `GET /api/lectures/:id/summary` - Generate summary
- `GET /api/lectures/:id/quiz` - Generate quiz

## 🔐 Security Features

- **JWT Token Management** - Secure token storage and refresh
- **Input Validation** - Client-side validation for all forms
- **File Type Validation** - Strict file type and size validation
- **XSS Protection** - Proper HTML escaping and sanitization
- **CSRF Protection** - Token-based request validation

## 🎯 Performance Optimizations

- **Lazy Loading** - Images and content loaded on demand
- **Debounced Search** - Optimized search with debouncing
- **Efficient DOM Updates** - Minimal DOM manipulations
- **Resource Caching** - Proper cache headers and strategies
- **Compressed Assets** - Minified CSS and optimized images

## 🧪 Testing

### Manual Testing Checklist
- [ ] User registration and login
- [ ] Video upload with progress tracking
- [ ] Lecture viewing and navigation
- [ ] Summary generation
- [ ] Quiz creation and taking
- [ ] Responsive design on different devices
- [ ] Offline functionality
- [ ] Error handling scenarios

### Browser Testing
Test the application across different browsers and devices to ensure compatibility.

## 🐛 Troubleshooting

### Common Issues

1. **CORS Errors**
   - Ensure the backend is running and CORS is properly configured
   - Serve the frontend through a web server, not file://

2. **API Connection Issues**
   - Check the API_BASE_URL in config.js
   - Verify the backend is running on the correct port

3. **File Upload Issues**
   - Check file size limits in both frontend and backend
   - Verify file types are supported

4. **Authentication Issues**
   - Clear browser storage and try again
   - Check token expiration settings

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes
4. Test thoroughly
5. Commit your changes: `git commit -am 'Add feature'`
6. Push to the branch: `git push origin feature-name`
7. Submit a pull request

### Code Style
- Use consistent indentation (2 spaces)
- Follow JavaScript ES6+ standards
- Use meaningful variable and function names
- Add comments for complex logic
- Follow the existing code structure

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- **Font Awesome** - Icons
- **Google Fonts** - Inter font family
- **Modern CSS** - CSS Grid and Flexbox layouts
- **Vanilla JavaScript** - No framework dependencies

## 📞 Support

For support, please:
1. Check the troubleshooting section
2. Search existing issues on GitHub
3. Create a new issue with detailed information
4. Contact the development team

---

**Built with ❤️ by the LearningApp Team**
