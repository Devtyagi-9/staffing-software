# Staffing Management Platform

A modern Pair-Programming Staffing & Roster Management web application built with a React frontend (Vite), Express backend, and Prisma/SQLite database.

## Tech Stack
*   **Frontend**: React, TypeScript, Vite, Vanilla CSS
*   **Backend**: Node.js, Express, TypeScript, `ts-node-dev`
*   **Database**: SQLite via Prisma ORM
*   **Testing**: Vitest

---

## Getting Started & Local Setup

### 1. Prerequisites
Ensure you have the following installed on your machine:
*   [Node.js](https://nodejs.org/) (v18 or higher recommended)
*   npm (installed automatically with Node.js)

### 2. Clone the Repository
```bash
git clone https://github.com/Devtyagi-9/staffing-software.git
cd staffing-software
```

### 3. Install Dependencies
Install all package dependencies for the project:
```bash
npm install
```

### 4. Database Setup
Initialize the SQLite database schema and run the seed script to create test accounts, workers, payers, and initial rosters:
```bash
# Generate the Prisma Client
npm run db:generate

# Push the schema changes to your local SQLite dev.db
npm run db:push

# Seed the database with sample data (workers, payers, clients, configurations)
npm run db:seed
```

### 5. Running the Application
To start both the backend API server and the frontend client simultaneously:
```bash
npm run dev
```

*   **Frontend Client**: Runs on [http://localhost:3000](http://localhost:3000)
*   **Backend API**: Runs on [http://localhost:4000](http://localhost:4000)

---

## Seed Accounts & Credentials

To log into the system, you can use the default administrator credentials seeded in `prisma/seed.ts`:

*   **Email**: `admin@apexstaffing.com.au`
*   **Password**: `password123`

---

## Run Testing Suite

To execute the automated integration tests:
```bash
npm run test
```

This runs the Vitest integration suite verifying worker requirement approvals, shift materialization, billable hour adjustments, candidate matching, and the invoice billing system.

---

## Project Structure & Deployment Guide

This project is set up as a monorepo with segregated Frontend (FE) and Backend (BE) layers.

```
├── prisma/               # Database schemas and seed scripts (Prisma/SQLite)
├── server/               # Express.js Backend (BE API)
│   └── src/              # Routes, controllers, and database services
├── src/                  # React Frontend (FE Client)
│   ├── components/       # UI panels and controls
│   └── api/              # API caller clients communicating with BE
├── index.html            # FE entry page
├── vite.config.ts        # Vite configuration (includes dev-proxy to BE on 4000)
└── package.json          # Combined project dependencies & scripts
```

### Production Deployment Options

To deploy this software in a production environment, you have two primary deployment strategies:

#### Option A: Segregated Deployment (Recommended)
This approach scales the frontend and backend independently.

1.  **Frontend (React Client)**:
    *   Compile the client into optimized static assets:
        ```bash
        npm run build
        ```
    *   This generates a static `dist/` directory.
    *   Deploy the `dist/` directory to static hosting services like **Vercel**, **Netlify**, **Cloudflare Pages**, or **AWS S3 + CloudFront**.
    *   *Note:* Ensure you set the API base URL in `src/api/client.ts` to your deployed backend domain (e.g. `https://api.yourdomain.com`).

2.  **Backend (Express API)**:
    *   Deploy the `server/` directory and node configuration to web services like **Render**, **Railway**, **Heroku**, or **Fly.io**.
    *   Set environment variables: `PORT`, `JWT_SECRET`, etc.
    *   Deploy SQLite or swap the database connection in `prisma/schema.prisma` to a hosted database (like PostgreSQL) by updating the `datasource db` provider.

#### Option B: Unified Monolith Deployment
Serve the compiled static frontend directly from the backend Express server.

1.  Add static file serving code to the bottom of `server/src/index.ts` just before exporting:
    ```typescript
    if (process.env.NODE_ENV === 'production') {
      app.use(express.static(path.join(__dirname, '../../dist')));
      app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../../dist/index.html'));
      });
    }
    ```
2.  Build the frontend: `npm run build`
3.  Deploy the entire repository to a server platform (Render, AWS EBS, Heroku) and start the backend service: `node server/dist/index.js` (or via ts-node in production).