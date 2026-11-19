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

  it('changes the password and keeps the session', async () => {
    const agent = authAgent();
    const { email, password } = await registerUser(agent, 'Grace Hopper');
    const anonymous = await request(app).post('/api/auth/password').send({
      currentPassword: password,
      newPassword: 'Newpass123!',
    });
    expect(anonymous.status).toBe(401);

    const wrong = await agent.post('/api/auth/password').send({
      currentPassword: 'not-the-password',
      newPassword: 'Newpass123!',
    });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.message).toBe('Current password is incorrect');

    const same = await agent.post('/api/auth/password').send({
      currentPassword: password,
      newPassword: password,
    });
    expect(same.status).toBe(400);
    expect(same.body.error.code).toBe('same_password');

    const weak = await agent.post('/api/auth/password').send({
      currentPassword: password,
      newPassword: 'short',
    });
    expect(weak.status).toBe(400);

    const other = authAgent();
    const otherLogin = await other.post('/api/auth/login').send({ email, password });
    expect(otherLogin.status).toBe(200);

    const changed = await agent.post('/api/auth/password').send({
      currentPassword: password,
      newPassword: 'Newpass123!',
    });
    expect(changed.status).toBe(204);
    expect(changed.body).toEqual({});

    const still = await agent.get('/api/auth/me');
    expect(still.status).toBe(200);
    const signedOut = await other.get('/api/auth/me');
    expect(signedOut.status).toBe(401);

    const oldLogin = await authAgent().post('/api/auth/login').send({ email, password });
    expect(oldLogin.status).toBe(401);
    const nextLogin = await authAgent().post('/api/auth/login').send({ email, password: 'Newpass123!' });
    expect(nextLogin.status).toBe(200);
    expect(nextLogin.body.user.passwordHash).toBeUndefined();
  });

  it('ends a copied session on logout and leaves the other browser signed in', async () => {
    const agent = authAgent();
    const registered = await agent.post('/api/auth/register').send({
      name: 'Grace Hopper',
      email: 'grace-sessions@example.com',
      password: 'Password123!',
    });
    expect(registered.status).toBe(201);
    const cookie = (registered.headers['set-cookie'] as string[]).map((value) => value.split(';')[0]).join('; ');

    const other = authAgent();
    const otherLogin = await other.post('/api/auth/login').send({
      email: 'grace-sessions@example.com',
      password: 'Password123!',
    });
    expect(otherLogin.status).toBe(200);

    await agent.post('/api/auth/logout').expect(204);
    const replay = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(replay.status).toBe(401);
    const after = await agent.get('/api/auth/me');
    expect(after.status).toBe(401);
    const still = await other.get('/api/auth/me');
    expect(still.status).toBe(200);
  });

  it('reports database health', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, db: 'connected' });
  });
});
