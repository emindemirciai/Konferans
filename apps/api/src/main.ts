import http from 'http';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './env.js';
import { router } from './routes.js';
import { simpleRateLimit } from './rate-limit.js';
import { attachSocket } from './socket.js';

const app = express();
if (env.TRUST_PROXY === 'true') app.set('trust proxy', 1);

app.use(helmet({ crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: env.CORS_ORIGIN.split(',').map((x) => x.trim()), credentials: true }));
app.use(express.json({ limit: env.MAX_JSON_BODY }));
app.use(cookieParser());
app.use(morgan('tiny'));
app.use(simpleRateLimit);
app.get('/health', (_req, res) => res.json({ ok: true, name: "Konferans API", version: '0.4.0' }));
app.use('/api', router);

const server = http.createServer(app);
attachSocket(server);

server.listen(env.API_PORT, () => {
  console.log(`Konferans API listening on :${env.API_PORT}`);
});
