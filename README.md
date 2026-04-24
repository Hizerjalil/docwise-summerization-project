# DOCWISE — AI Smart Document Summarizer

DOCWISE is a modern, AI-powered document summarizer that helps students, researchers, and writers save time by turning long documents into short, meaningful summaries.

## Features
- **Instant Summarization**: Upload documents (PDF, TXT, DOC) or paste text to get summaries in seconds.
- **Secure Authentication**: Register and log in to save your summaries.
- **Manage History**: Save, search, and delete your previous summaries.
- **Modern UI**: Clean, responsive, and easy-to-use interface with a sleek dark aesthetic.

## Tech Stack
- **Frontend**: HTML5, Vanilla CSS, Modular JavaScript (ES Modules).
- **Backend**: Node.js, Express.
- **Database**: PostgreSQL with `pg` pool.
- **Authentication**: JSON Web Tokens (JWT) & Bcrypt for password hashing.

## Project Structure
```text
sumerize/
├── backend/            # Express API
│   ├── controllers/    # Business logic
│   ├── db/            # Database connection & init
│   ├── middleware/     # Auth and Error handlers
│   ├── routes/         # Endpoint definitions
│   └── server.js       # Entry point
├── frontend/           # Client-side files
│   ├── assets/         # Images
│   ├── css/            # Style sheets
│   ├── js/             # Modular JS
│   ├── index.html      # Landing page
│   ├── sign.html       # Auth page
│   └── work.html       # Application page
└── README.md
```

## Setup & Installation

### 1. Prerequisites
- Node.js (v14+)
- PostgreSQL

### 2. Backend Setup
1. Navigate to the `backend` folder: `cd backend`
2. Install dependencies: `npm install`
3. Create a `.env` file based on the environment needs (see `.env` section).
4. Start the server: `npm run dev`

### 3. Database Initializaton
The database is automatically initialized when the backend starts if the `DATABASE_URL` is correctly configured in `.env`.

### 4. Frontend Usage
Simply open `frontend/index.html` using a local web server (e.g., VS Code Live Server extension) or serve it using any HTTP server.

## License
Developed for educational purposes as a Final Year Project.
