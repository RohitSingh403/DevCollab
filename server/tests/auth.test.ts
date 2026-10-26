import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, authAgent, registerUser } from './helpers';

describe('authentication', () => {
  it('registers a user, sets an httpOnly cookie, and hides the password hash', async () => {
    const agent = authAgent();
    const response = await agent.post('/api/auth/register').send({
      name: 'Ada Lovelace',
      email: 'Ada@Example.com',
      password: 'Password123!',
    });

    expect(response.status).toBe(201);
    expect(response.body.user.email).toBe('ada@example.com');
    expect(response.body.user.passwordHash).toBeUndefined();
    expect(response.body.user.id).toBeTruthy();
    const cookie = response.headers['set-cookie']?.join(';') ?? '';
    expect(cookie).toMatch(/devcollab_token=/);
    expect(cookie.toLowerCase()).toContain('httponly');

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('ada@example.com');
  });

  it('rejects weak passwords and duplicate emails', async () => {
    const agent = authAgent();
    const weak = await agent.post('/api/auth/register').send({
      name: 'Ada Lovelace',
      email: 'ada2@example.com',
      password: 'short',
    });
    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe('validation_error');

    await registerUser(agent, 'First');
    const email = 'taken@example.com';
    await agent.post('/api/auth/register').send({ name: 'First Person', email, password: 'Password123!' });
    const other = authAgent();
    const duplicate = await other.post('/api/auth/register').send({
      name: 'Second Person',
      email,
      password: 'Password123!',
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('email_taken');
  });

  it('logs in, updates the profile, and logs out', async () => {
    const agent = authAgent();
    const { email, password } = await registerUser(agent, 'Grace Hopper');
    await agent.post('/api/auth/logout');

    const anonymous = await request(app).get('/api/auth/me');
    expect(anonymous.status).toBe(401);

    const bad = await agent.post('/api/auth/login').send({ email, password: 'wrong-password' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.message).toBe('Email or password is incorrect');

    const missing = await agent.post('/api/auth/login').send({ email: 'missing@example.com', password });
    expect(missing.status).toBe(401);
    expect(missing.body.error.message).toBe('Email or password is incorrect');

    const loggedIn = await agent.post('/api/auth/login').send({ email, password });
    expect(loggedIn.status).toBe(200);

    const renamed = await agent.patch('/api/auth/me').send({ name: 'Grace B. Hopper' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.user.name).toBe('Grace B. Hopper');

    await agent.post('/api/auth/logout').expect(204);
    const after = await agent.get('/api/auth/me');
    expect(after.status).toBe(401);
  });

  it('reports database health', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, db: 'connected' });
  });
});
