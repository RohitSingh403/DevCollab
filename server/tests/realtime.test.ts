import type { AddressInfo } from 'net';
import { io as client } from 'socket.io-client';
import { afterAll, describe, expect, it } from 'vitest';
import { createHttpServer } from '../src/app';

const { httpServer } = createHttpServer();

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    httpServer.close((error) => (error ? reject(error) : resolve()));
  });
});

function cookieFrom(response: Response) {
  const raw = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
  return raw.map((value) => value.split(';')[0]).join('; ');
}

describe('realtime updates', () => {
  it('pushes issue events to other members of the workspace', async () => {
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', () => resolve()));
    const address = httpServer.address() as AddressInfo;
    const base = `http://127.0.0.1:${address.port}`;

    async function register(name: string, email: string) {
      const response = await fetch(`${base}/api/auth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, email, password: 'Password123!' }),
      });
      const body = (await response.json()) as { user: { id: string; email: string } };
      return { cookie: cookieFrom(response), user: body.user, status: response.status };
    }

    const owner = await register('Owner Live', 'owner-live@example.com');
    const member = await register('Member Live', 'member-live@example.com');
    expect(owner.status).toBe(201);

    const workspaceResponse = await fetch(`${base}/api/workspaces`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: owner.cookie },
      body: JSON.stringify({ name: 'Live', description: '' }),
    });
    const workspaceBody = (await workspaceResponse.json()) as { workspace: { id: string } };
    const workspaceId = workspaceBody.workspace.id;

    await fetch(`${base}/api/workspaces/${workspaceId}/invites`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: owner.cookie },
      body: JSON.stringify({ email: member.user.email, role: 'member' }),
    });

    const projectResponse = await fetch(`${base}/api/workspaces/${workspaceId}/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: owner.cookie },
      body: JSON.stringify({ name: 'Live API', key: 'LIVE', description: '' }),
    });
    const projectBody = (await projectResponse.json()) as { project: { id: string } };

    const socket = client(base, {
      extraHeaders: { cookie: member.cookie },
      transports: ['websocket'],
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('socket connect timed out')), 8000);
      socket.on('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      socket.on('connect_error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });

    const joined = await new Promise<{ ok: boolean }>((resolve, reject) => {
      socket.timeout(5000).emit('workspace:join', workspaceId, (error: Error | null, result: { ok: boolean }) => {
        if (error) reject(error);
        else resolve(result);
      });
    });
    expect(joined.ok).toBe(true);

    const received = new Promise<{ issueId: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('issue event timed out')), 8000);
      socket.on('issue:created', (payload: { issueId: string }) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });

    const issueResponse = await fetch(`${base}/api/projects/${projectBody.project.id}/issues`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: owner.cookie },
      body: JSON.stringify({ title: 'Broadcast this issue' }),
    });
    expect(issueResponse.status).toBe(201);
    const issueBody = (await issueResponse.json()) as { issue: { id: string } };
    await expect(received).resolves.toEqual({ issueId: issueBody.issue.id, projectId: projectBody.project.id });
    socket.close();
  });
});
