# Strmly Backend API

Strmly is a comprehensive video streaming platform backend built with Node.js, Express.js, and MongoDB. This API provides endpoints for user authentication, video management, series creation, community features, and more.

## Features

- User Authentication & Authorization (JWT-based)
- Video Upload & Management (Long videos and Shorts)
- Series Management with Episodes
- Community Features (Create, Follow, Manage)
- User Interactions (Like, Share, Comment)
- Search Functionality (Global & Personalized)
- AWS S3 Integration for File Storage
- User Profile Management
- Content Moderation & Safety Features

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JSON Web Tokens (JWT)
- **File Storage**: AWS S3
- **Password Hashing**: bcrypt
- **File Upload**: Multer
- **Environment Management**: dotenv

## Prerequisites

- Node.js (v14 or higher)
- MongoDB database
- AWS S3 bucket for file storage
- npm or yarn package manager

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/strmly
JWT_SECRET=your_jwt_secret_key
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=your_aws_region
AWS_S3_BUCKET=your_s3_bucket_name
```

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables
4. Start the development server:
   ```bash
   npm run dev
   ```
5. For production:
   ```bash
   npm start
   ```

## Project Structure

```
backend/
├── config/          # Configuration files
├── controller/      # Route controllers
├── middleware/      # Custom middleware
├── models/          # MongoDB models
├── routes/          # API routes
├── utils/           # Utility functions
└── server.js        # Main application file
```

## API Endpoints

### Authentication Routes (`/api/v1/auth`)

| Route             | Method | Request Body                    | Response                   | Description                   |
| ----------------- | ------ | ------------------------------- | -------------------------- | ----------------------------- |
| `/register`       | POST   | `{ username, email, password }` | `{ message, token, user }` | Register a new user           |
| `/login/email`    | POST   | `{ email, password }`           | `{ message, token, user }` | Login with email              |
| `/login/username` | POST   | `{ username, password }`        | `{ message, token, user }` | Login with username           |
| `/logout`         | POST   | -                               | `{ message }`              | Logout user                   |
| `/refresh`        | POST   | -                               | `{ message, token, user }` | Refresh JWT token (Protected) |

### Video Routes (`/api/v1/videos`)

| Route              | Method | Request Body                       | Response                 | Description                      |
| ------------------ | ------ | ---------------------------------- | ------------------------ | -------------------------------- |
| `/upload`          | POST   | FormData with video file           | `{ message, video }`     | Upload a new video (Protected)   |
| `/search`          | GET    | Query params: `q`, `page`, `limit` | `{ videos, pagination }` | Search videos                    |
| `/trending`        | GET    | Query params: `page`, `limit`      | `{ videos, pagination }` | Get trending videos              |
| `/by-genre/:genre` | GET    | Query params: `page`, `limit`      | `{ videos, pagination }` | Get videos by genre              |
| `/:id`             | GET    | -                                  | `{ video }`              | Get video by ID                  |
| `/:id`             | PUT    | `{ title, description, tags }`     | `{ message, video }`     | Update video (Protected)         |
| `/:id`             | DELETE | -                                  | `{ message }`            | Delete video (Protected)         |
| `/:id/view`        | POST   | -                                  | `{ message }`            | Increment view count (Protected) |
| `/:id/related`     | GET    | -                                  | `{ videos }`             | Get related videos               |

### Series Routes (`/api/v1/series`)

| Route                            | Method | Request Body                       | Response                 | Description                            |
| -------------------------------- | ------ | ---------------------------------- | ------------------------ | -------------------------------------- |
| `/create`                        | POST   | `{ title, description, genre }`    | `{ message, series }`    | Create new series (Protected)          |
| `/search`                        | GET    | Query params: `q`, `page`, `limit` | `{ series, pagination }` | Search series                          |
| `/all`                           | GET    | Query params: `page`, `limit`      | `{ series, pagination }` | Get all series                         |
| `/:id`                           | GET    | -                                  | `{ series }`             | Get series by ID                       |
| `/:id`                           | PUT    | `{ title, description }`           | `{ message, series }`    | Update series (Protected)              |
| `/:id`                           | DELETE | -                                  | `{ message }`            | Delete series (Protected)              |
| `/:id/episodes`                  | POST   | `{ videoId, episodeNumber }`       | `{ message, series }`    | Add episode to series (Protected)      |
| `/:seriesId/episodes/:episodeId` | DELETE | -                                  | `{ message }`            | Remove episode from series (Protected) |

### Shorts Routes (`/api/v1/shorts`)

| Route       | Method | Request Body                  | Response                 | Description                    |
| ----------- | ------ | ----------------------------- | ------------------------ | ------------------------------ |
| `/feed`     | GET    | Query params: `page`, `limit` | `{ shorts, pagination }` | Get shorts feed                |
| `/trending` | GET    | Query params: `page`, `limit` | `{ shorts, pagination }` | Get trending shorts            |
| `/:id`      | GET    | -                             | `{ short }`              | Get short video by ID          |
| `/:id`      | PUT    | `{ title, description }`      | `{ message, short }`     | Update short video (Protected) |
| `/:id`      | DELETE | -                             | `{ message }`            | Delete short video (Protected) |

### User Routes (`/api/v1/user`)

| Route            | Method | Request Body                  | Response               | Description                       |
| ---------------- | ------ | ----------------------------- | ---------------------- | --------------------------------- |
| `/feed`          | GET    | Query params: `page`, `limit` | `{ feed, pagination }` | Get user feed (Protected)         |
| `/profile`       | GET    | -                             | `{ user }`             | Get user profile (Protected)      |
| `/profile`       | PUT    | `{ username, email, bio }`    | `{ message, user }`    | Update profile (Protected)        |
| `/communities`   | GET    | -                             | `{ communities }`      | Get user communities (Protected)  |
| `/videos`        | GET    | -                             | `{ videos }`           | Get user videos (Protected)       |
| `/interactions`  | GET    | -                             | `{ interactions }`     | Get user interactions (Protected) |
| `/earnings`      | GET    | -                             | `{ earnings }`         | Get user earnings (Protected)     |
| `/notifications` | GET    | -                             | `{ notifications }`    | Get notifications (Protected)     |

### Community Routes (`/api/v1/community`)

| Route                   | Method | Request Body                | Response                 | Description                      |
| ----------------------- | ------ | --------------------------- | ------------------------ | -------------------------------- |
| `/create`               | POST   | `{ name, description }`     | `{ message, community }` | Create community (Protected)     |
| `/rename`               | PUT    | `{ communityId, newName }`  | `{ message, community }` | Rename community (Protected)     |
| `/change-profile-photo` | PUT    | `{ communityId, photoUrl }` | `{ message, community }` | Change profile photo (Protected) |
| `/follow`               | POST   | `{ communityId }`           | `{ message }`            | Follow community (Protected)     |
| `/add-bio`              | PUT    | `{ communityId, bio }`      | `{ message, community }` | Add bio to community (Protected) |

### Interaction Routes (`/api/v1/interaction`)

| Route      | Method | Request Body            | Response                | Description                   |
| ---------- | ------ | ----------------------- | ----------------------- | ----------------------------- |
| `/like`    | POST   | `{ videoId, type }`     | `{ message, liked }`    | Like/unlike video (Protected) |
| `/share`   | POST   | `{ videoId, platform }` | `{ message, shareUrl }` | Share video (Protected)       |
| `/comment` | POST   | `{ videoId, content }`  | `{ message, comment }`  | Comment on video (Protected)  |

### Search Routes (`/api/v1/search`)

| Route           | Method | Request Body                      | Response                  | Description                     |
| --------------- | ------ | --------------------------------- | ------------------------- | ------------------------------- |
| `/`             | GET    | Query params: `q`, `type`, `page` | `{ results, pagination }` | Global search (Protected)       |
| `/personalized` | GET    | Query params: `page`, `limit`     | `{ results, pagination }` | Personalized search (Protected) |
| `/by-type`      | GET    | Query params: `type`, `page`      | `{ results, pagination }` | Get content by type (Protected) |

### Caution Routes (`/api/v1/caution`)

| Route                     | Method | Request Body               | Response                    | Description                             |
| ------------------------- | ------ | -------------------------- | --------------------------- | --------------------------------------- |
| `/video/long/:videoId`    | DELETE | -                          | `{ message }`               | Delete long video (Protected)           |
| `/video/short/:videoId`   | DELETE | -                          | `{ message }`               | Delete short video (Protected)          |
| `/videos/bulk`            | DELETE | `{ videoIds }`             | `{ message, deletedCount }` | Bulk delete videos (Protected)          |
| `/profile`                | DELETE | -                          | `{ message }`               | Delete user profile (Protected)         |
| `/community/:communityId` | DELETE | -                          | `{ message }`               | Delete community (Protected)            |
| `/series/:seriesId`       | DELETE | -                          | `{ message }`               | Delete series (Protected)               |
| `/community/remove-video` | PATCH  | `{ communityId, videoId }` | `{ message }`               | Remove video from community (Protected) |
| `/community/unfollow`     | PATCH  | `{ communityId }`          | `{ message }`               | Unfollow community (Protected)          |
| `/community/remove-user`  | PATCH  | `{ communityId, userId }`  | `{ message }`               | Remove user from community (Protected)  |

## Authentication

Most endpoints require authentication. Include the JWT token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

## Error Handling

The API returns consistent error responses:

```json
{
  "message": "Error description",
  "error": "Detailed error information (in development)"
}
```

## Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error

## Health Check

A health check endpoint is available at:

```
GET /health
```

Response: `"Server is healthy"`

## Development

For development, the server uses nodemon for automatic restarts:

```bash
npm run dev
```
