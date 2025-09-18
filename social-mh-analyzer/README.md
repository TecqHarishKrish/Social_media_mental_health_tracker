# Social Media & Mental Health Analyzer

A full-stack web application that helps users understand the relationship between their social media usage and mental well-being by analyzing engagement metrics and providing insights.

## Features

- **User Authentication**: Secure signup and login with JWT
- **Social Media Integration**: Connect social media accounts (Instagram, Twitter, etc.)
- **CSV Upload**: Manual upload of social media metrics
- **Sentiment Analysis**: Analyze post content for emotional tone
- **Engagement Metrics**: Track likes, comments, shares, and more
- **Mental Health Insights**: Get personalized insights based on your activity
- **Calendar View**: Visualize your mood and activity over time
- **Parental Notifications**: For users under 18, with parent/guardian contact

## Tech Stack

- **Frontend**: React, Vite, Tailwind CSS
- **Backend**: Node.js, Express
- **Database**: MongoDB with Mongoose
- **Authentication**: JWT (JSON Web Tokens)
- **Analysis**: Custom sentiment analysis engine
- **Email**: Nodemailer for notifications

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- MongoDB (local or Atlas)

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/social-mh-analyzer.git
cd social-mh-analyzer
```

### 2. Set Up Backend

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   yarn
   ```

3. Create a `.env` file in the backend directory based on `.env.example`:
   ```bash
   cp .env.example .env
   ```

4. Update the `.env` file with your configuration:
   ```env
   PORT=5000
   NODE_ENV=development
   MONGODB_URI=mongodb://localhost:27017/social_mh_analyzer
   JWT_SECRET=your_jwt_secret_key_here
   JWT_EXPIRE=30d
   EMAIL_HOST=smtp.example.com
   EMAIL_PORT=587
   EMAIL_USER=your_email@example.com
   EMAIL_PASS=your_email_password
   EMAIL_FROM=no-reply@socialmhanalyzer.com
   FRONTEND_URL=http://localhost:3000
   ```

5. Seed the database with sample data (optional):
   ```bash
   npm run seed
   # or
   yarn seed
   ```

6. Start the backend server:
   ```bash
   npm run dev
   # or
   yarn dev
   ```

### 3. Set Up Frontend

1. Open a new terminal and navigate to the frontend directory:
   ```bash
   cd ../frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   yarn
   ```

3. Create a `.env` file in the frontend directory:
   ```env
   VITE_API_URL=http://localhost:5000/api
   VITE_GOOGLE_ANALYTICS_ID=your_ga_id
   ```

4. Start the development server:
   ```bash
   npm run dev
   # or
   yarn dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Demo Credentials

If you've seeded the database, you can log in with:

- **Email**: demo@example.com
- **Password**: demo1234

## API Documentation

API documentation is available at [http://localhost:5000/api-docs](http://localhost:5000/api-docs) when the backend server is running.

## Sample CSV Format

You can upload social media metrics using a CSV file with the following format:

```
userEmail,provider,providerPostId,timestamp,likes,comments,shares,saves,watchTimeSeconds,text
demo@example.com,instagram,post_12345,2025-08-01T10:30:00Z,150,12,5,8,120,Having a great day at the beach! #summer #vacation
```

A sample CSV file is available at `backend/sample_data/sample_metrics.csv`.

## Environment Variables

### Backend (`.env`)

| Variable | Description | Default |
|----------|-------------|---------|
| PORT | Port for the backend server | 5000 |
| NODE_ENV | Node environment | development |
| MONGODB_URI | MongoDB connection string | mongodb://localhost:27017/social_mh_analyzer |
| JWT_SECRET | Secret key for JWT | (required) |
| JWT_EXPIRE | JWT expiration time | 30d |
| EMAIL_HOST | SMTP server host | (required for email) |
| EMAIL_PORT | SMTP server port | 587 |
| EMAIL_USER | SMTP username | (required for email) |
| EMAIL_PASS | SMTP password | (required for email) |
| EMAIL_FROM | Sender email address | no-reply@socialmhanalyzer.com |
| FRONTEND_URL | Frontend URL for CORS | http://localhost:3000 |

### Frontend (`.env`)

| Variable | Description | Default |
|----------|-------------|---------|
| VITE_API_URL | Backend API URL | http://localhost:5000/api |
| VITE_GOOGLE_ANALYTICS_ID | Google Analytics ID | (optional) |

## Project Structure

```
social-mh-analyzer/
├── backend/                 # Backend server
│   ├── src/
│   │   ├── config/         # Configuration files
│   │   ├── controllers/    # Route controllers
│   │   ├── middleware/     # Custom middleware
│   │   ├── models/         # MongoDB models
│   │   ├── routes/         # API routes
│   │   ├── services/       # Business logic
│   │   ├── utils/          # Utility functions
│   │   └── app.js          # Express app setup
│   ├── .env.example        # Example environment variables
│   ├── package.json        # Backend dependencies
│   └── server.js           # Server entry point
│
├── frontend/               # Frontend React app
│   ├── public/             # Static files
│   ├── src/
│   │   ├── assets/         # Images, fonts, etc.
│   │   ├── components/     # Reusable components
│   │   ├── context/        # React context
│   │   ├── hooks/          # Custom hooks
│   │   ├── pages/          # Page components
│   │   ├── services/       # API services
│   │   ├── styles/         # Global styles
│   │   ├── utils/          # Utility functions
│   │   ├── App.jsx         # Main App component
│   │   └── main.jsx        # Entry point
│   ├── .env.example        # Example environment variables
│   ├── package.json        # Frontend dependencies
│   └── vite.config.js      # Vite configuration
│
├── .gitignore              # Git ignore file
└── README.md               # This file
```

## Available Scripts

### Backend

- `npm run dev` - Start the development server with nodemon
- `npm start` - Start the production server
- `npm test` - Run tests
- `npm run seed` - Seed the database with sample data
- `npm run lint` - Lint the code

### Frontend

- `npm run dev` - Start the development server
- `npm run build` - Build for production
- `npm run preview` - Preview the production build
- `npm test` - Run tests
- `npm run lint` - Lint the code

## Contributing

1. Fork the repository
2. Create a new branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [React](https://reactjs.org/)
- [Node.js](https://nodejs.org/)
- [Express](https://expressjs.com/)
- [MongoDB](https://www.mongodb.com/)
- [Mongoose](https://mongoosejs.com/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Vite](https://vitejs.dev/)
