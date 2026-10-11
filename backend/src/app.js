import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import env from './config/env.js';
import authRoutes from './routes/auth.js';
import questionRoutes from './routes/questions.js';
import revisionRoutes from './routes/revisions.js';
import dashboardRoutes from './routes/dashboard.js';
import analyticsRoutes from './routes/analytics.js';
import activityRoutes from './routes/activity.js';
import importRoutes from './routes/import.js';
import interviewRoutes from './routes/interview.js';
import topicRoutes from './routes/topics.js';
import codeRoutes from './routes/code.js';
import taskRoutes from './routes/tasks.js';
import { notFound, errorHandler } from './middleware/error.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.set('trust proxy', 1);

app.use(
  cors({
    origin: [env.clientUrl, 'http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  })
);
app.use(express.json({ limit: '8mb' }));
app.use(express.text({ type: ['text/csv', 'text/plain'], limit: '8mb' }));
app.use(cookieParser());
if (env.nodeEnv !== 'test') app.use(morgan(env.nodeEnv === 'production' ? 'tiny' : 'dev'));

app.get('/api/health', (req, res) => {
  res.json({ success: true, name: 'DSAForge API', time: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/revisions', revisionRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/import', importRoutes);
app.use('/api/interview', interviewRoutes);
app.use('/api/topics', topicRoutes);
app.use('/api/code', codeRoutes);
app.use('/api/tasks', taskRoutes);

app.use('/api', notFound);

// --- Serve the built SPA in production (single-origin deployment) -----------
const distDir = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.use(notFound);
app.use(errorHandler);

export default app;
