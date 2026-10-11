import app from './src/app.js';
import env from './src/config/env.js';
import { connectDB } from './src/config/db.js';

connectDB()
  .then(() => {
    app.listen(env.port, () => {
      console.log(`[api] DSAForge listening on http://localhost:${env.port} (${env.nodeEnv})`);
    });
  })
  .catch((err) => {
    console.error('[db] connection failed:', err.message);
    process.exit(1);
  });

process.on('unhandledRejection', (err) => {
  console.error('[fatal] unhandled rejection:', err);
});
