# OsmAnd Real-Time GPS Tracker

This project is a real-time GPS tracking server designed to work with the OsmAnd mobile app. It receives location data from OsmAnd devices, stores it in a PostgreSQL database, and displays the trackers' live positions on a web-based map.

## Features

- **Real-time Location Tracking:** Receives and processes GPS data from OsmAnd via HTTP POST requests.
- **WebSocket Updates:** Pushes live location updates to connected web clients using Socket.IO.
- **Web Interface:** A secure, password-protected web page to view all trackers on a map (using Leaflet.js).
- **PostgreSQL Storage:** Persists tracker location history in a PostgreSQL database.
- **Secure Authentication:** User authentication is handled through a database with hashed passwords.
- **Environment-based Configuration:** Securely manages database credentials and other settings using environment variables, ready for deployment on services like Render.com.

## Tech Stack

- **Backend:** Node.js, Express.js
- **Real-time Communication:** Socket.IO
- **Database:** PostgreSQL
- **Authentication:** bcrypt for password hashing, express-session for session management
- **Frontend:** HTML, CSS, JavaScript, Leaflet.js

## Setup and Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (v14 or later)
- [PostgreSQL](https://www.postgresql.org/)

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/your-repo-name.git
cd your-repo-name
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment Variables

Create a `.env` file in the root of the project. This file will hold your database connection string.

```
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE"
```

Replace the placeholder with your actual PostgreSQL connection URL.

### 4. Set Up the Database

Connect to your PostgreSQL instance and run the following SQL scripts to create the necessary tables:

**Tracker Positions Table:**
```sql
-- From tracker_positions_schema.sql
CREATE TABLE tracker_positions (
    id SERIAL PRIMARY KEY,
    tracker_id VARCHAR NOT NULL,
    devicename VARCHAR,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    speed DOUBLE PRECISION,
    bearing DOUBLE PRECISION,
    altitude DOUBLE PRECISION,
    accuracy DOUBLE PRECISION,
    battery DOUBLE PRECISION,
    charge BOOLEAN
);
CREATE INDEX idx_tracker_time ON tracker_positions (tracker_id, timestamp);
```

**Users Table:**
```sql
-- From users_schema.sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### 5. Create an Admin User

To create the first user for logging into the web interface, run the interactive script from your terminal:

```bash
node create_admin.js
```

Follow the prompts to set a username and password. The script will output an `INSERT` SQL command. Run this command in your PostgreSQL database to create the user.

## Running the Application

Start the server with the following command:

```bash
node osmand_tracker_server.js
```

The server will start, and you can access the web interface and API endpoints:
- **Web Interface:** `http://localhost:3000`
- **OsmAnd Endpoint:** `http://localhost:3000/osmand`

## Deployment

This application is ready to be deployed on services like [Render.com](http://render.com/).

When deploying:
1.  Connect your GitHub repository to Render.
2.  Set the **Start Command** to `node osmand_tracker_server.js`.
3.  In the **Environment** tab of your Render service, add an environment variable with the key `DATABASE_URL` and the value of your production PostgreSQL connection string.
