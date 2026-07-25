import express from 'express';
import path from 'path';
import morgan from 'morgan';
import dotenv from 'dotenv';
import mysql from 'mysql2';
import userRoutes from './routes/authentication.js';
import commandeRoutes from './routes/commande.js';
import clientRoutes from './routes/client.js';
import cors from 'cors';

dotenv.config();

const app = express();

// --- CORS CONFIG ---
const allowedOrigins = [
  'https://leo-minor-frontend.vercel.app', // production frontend
  'http://localhost:3000',                  // local dev (adjust port if different)
  'http://localhost:5173',                  // in case you're using Vite
];

const corsOptions = {
  origin: function (origin, callback) {
    // allow requests with no origin (like curl, Postman, server-to-server)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS: ' + origin));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // explicitly handle preflight requests

app.use(express.json());

// Get the current directory using import.meta.url
const __dirname = path.dirname(new URL(import.meta.url).pathname);

// Middleware
app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Use the user routes for user-related API endpoints
app.use('/api/users', userRoutes);
app.use('/api/commandes', commandeRoutes);
app.use('/api/clients', clientRoutes);

// Create MySQL connection pool (instead of a single connection)
export const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
});

// Garde le pool actif en évitant les connexions mortes/inactives
setInterval(() => {
  db.query('SELECT 1', (err) => {
    if (err) console.error('Keep-alive ping failed:', err.message);
  });
}, 30000); // toutes les 30 secondes

// Test the pool connection once at startup
db.getConnection((err, connection) => {
  if (err) {
    console.error('Error connecting to MySQL:', err.message);
  } else {
    console.log('Connected to MySQL database');
    connection.release();
  }
});

// Define the base route
app.get('/', (req, res) => {
  res.send('Welcome to the Node.js App with MySQL!');
});

// Catch-all route for undefined routes
app.use((req, res, next) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Set the port
const PORT = process.env.PORT || 8080;

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});