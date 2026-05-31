import { Context, Next } from 'hono';
import { repo } from '../db/repository.js';

export async function authMiddleware(c: Context, next: Next) {
  // Extract token from header
  const authHeader = c.req.header('Authorization');
  let token = '';

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else {
    // Check for cookie or just reject
    return c.json({ error: 'Missing Authorization header' }, 401);
  }

  try {
    const user = await repo.getAuthenticatedUser(token);
    if (!user) {
      return c.json({ error: 'Invalid or expired token' }, 401);
    }

    // Set user in context
    c.set('user', user);
    c.set('userId', user.id);
    await next();
  } catch (err) {
    console.error('[Auth Middleware] Error:', err);
    return c.json({ error: 'Internal auth error' }, 500);
  }
}
