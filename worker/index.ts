import { Hono } from 'hono';

const app = new Hono<{ Bindings: { DB: any } }>();

// Import and register routes from the worker directory here
// Since we have multiple folders/files, we might need a dynamic import or static mapping
// For now, illustrating the structure:
// app.post('/api/auth/login', async (c) => { ... })

app.get('/health', (c) => c.json({ status: 'ok' }));

export default app;
