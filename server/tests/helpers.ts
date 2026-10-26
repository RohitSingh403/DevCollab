import request, { type Agent } from 'supertest';
import { createApp } from '../src/app';

export const app = createApp();

let sequence = 0;

export function authAgent() {
  return request.agent(app);
}

export async function registerUser(agent: Agent = authAgent(), name = 'Test User') {
  sequence += 1;
  const email = `user${sequence}@example.com`;
  const password = 'Password123!';
  const response = await agent.post('/api/auth/register').send({ name, email, password });
  if (response.status !== 201) {
    throw new Error(`register failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return {
    agent,
    email,
    password,
    user: response.body.user as { id: string; name: string; email: string; avatarColor: string },
  };
}

export async function createWorkspace(agent: Agent, name = 'Platform') {
  const response = await agent.post('/api/workspaces').send({ name, description: 'Team space' });
  if (response.status !== 201) {
    throw new Error(`workspace failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return response.body.workspace as { id: string; name: string; role: string; slug: string };
}
