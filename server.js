// server.js — AI DC Platform 정적 서버
import 'dotenv/config';
import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3009', 10);
const app = express();

// /css → css/ (public/ HTML에서 ../css/ 상대 경로 정합)
app.use('/css', express.static(join(__dirname, 'css')));
// / → public/
app.use('/', express.static(join(__dirname, 'public'), { maxAge: 0 }));

app.get('/api/health', (req, res) => res.json({
  status: 'ok', service: 'ai-dc-platform', port: PORT, timestamp: new Date().toISOString(),
}));

// index redirect
app.get('/', (req, res) => res.redirect('/home.html'));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[INIT] AI DC Platform 정적 서버: http://localhost:${PORT}`);
});
