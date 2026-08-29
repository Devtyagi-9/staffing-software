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