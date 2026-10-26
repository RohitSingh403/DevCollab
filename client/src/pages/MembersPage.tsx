import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Avatar, RoleBadge, useDocumentTitle } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import type { Role } from '../lib/types';
import { useAuthStore } from '../stores/authStore';
import { useUiStore } from '../stores/uiStore';

export function MembersPage() {
  const { workspaceId = '' } = useParams();
  const user = useAuthStore((state) => state.user);
  const pushToast = useUiStore((state) => state.pushToast);
  const queryClient = useQueryClient();
  const workspace = useQuery({ queryKey: ['workspace', workspaceId], queryFn: () => api.workspace(workspaceId) });
  const members = useQuery({ queryKey: ['members', workspaceId], queryFn: () => api.members(workspaceId) });
  const invites = useQuery({
    queryKey: ['invites', workspaceId],
    queryFn: () => api.invites(workspaceId),
    enabled: workspace.data?.role === 'owner' || workspace.data?.role === 'admin',
  });
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'admin'>('member');
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  useDocumentTitle('Members');
  const actorRole = workspace.data?.role;
  const canInvite = actorRole === 'owner' || actorRole === 'admin';

  const invite = useMutation({
    mutationFn: () => api.invite(workspaceId, { email, role: actorRole === 'admin' ? 'member' : role }),
    onSuccess: async (result) => {
      setEmail('');
      setLink(result.url ?? '');
      pushToast(result.kind === 'member' ? `${result.email} is now a member` : 'Invite link ready to share');
      await queryClient.invalidateQueries({ queryKey: ['members', workspaceId] });
      await queryClient.invalidateQueries({ queryKey: ['invites', workspaceId] });
    },
    onError: (reason) => setError(errorMessage(reason)),
  });

  const changeRole = useMutation({
    mutationFn: ({ userId, next }: { userId: string; next: Role }) => api.updateMember(workspaceId, userId, next),
    onSuccess: (next) => queryClient.setQueryData(['members', workspaceId], next),
    onError: (reason) => pushToast(errorMessage(reason)),
  });

  const remove = useMutation({
    mutationFn: (userId: string) => api.removeMember(workspaceId, userId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['members', workspaceId] });
      await queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] });
    },
    onError: (reason) => pushToast(errorMessage(reason)),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl font-bold">Members</h1>
        <p className="mt-2 max-w-2xl text-mist-400">
          Owners control the workspace. Admins manage projects and members. Members file issues and join the discussion.
        </p>
      </div>
      {canInvite ? (
        <form
          className="panel grid gap-3 p-4 md:grid-cols-[1fr_160px_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            setError('');
            setLink('');
            invite.mutate();
          }}
        >
          <label>
            <span className="label">Email</span>
            <input className="field" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            <span className="label">Role</span>
            <select className="field" value={role} onChange={(event) => setRole(event.target.value as 'member' | 'admin')} disabled={actorRole !== 'owner'}>
              <option value="member">Member</option>
              {actorRole === 'owner' ? <option value="admin">Admin</option> : null}
            </select>
          </label>
          <div className="flex items-end">
            <button className="btn-primary w-full" type="submit" disabled={invite.isPending}>
              Invite
            </button>
          </div>
          {error ? <p className="text-sm text-rose md:col-span-3" role="alert">{error}</p> : null}
          {link ? (
            <p className="text-sm text-mist-300 md:col-span-3">
              Share this link once. It is not stored again. <span className="break-all font-mono text-acid">{link}</span>
            </p>
          ) : null}
        </form>
      ) : null}
      <ul className="panel divide-y divide-white/5">
        {(members.data ?? []).map((member) => {
          const self = member.user.id === user?.id;
          const canEditTarget = !self && (actorRole === 'owner' || (actorRole === 'admin' && member.role === 'member'));
          return (
            <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <span className="flex items-center gap-3">
                <Avatar name={member.user.name} color={member.user.avatarColor} />
                <span>
                  <span className="block font-medium">{member.user.name}{self ? ' (you)' : ''}</span>
                  <span className="block text-sm text-mist-500">{member.user.email}</span>
                </span>
              </span>
              <span className="flex items-center gap-2">
                {canEditTarget ? (
                  <select
                    className="field w-auto"
                    aria-label={`Role for ${member.user.name}`}
                    value={member.role}
                    onChange={(event) => changeRole.mutate({ userId: member.user.id, next: event.target.value as Role })}
                  >
                    <option value="member">Member</option>
                    {actorRole === 'owner' ? <option value="admin">Admin</option> : null}
                    {actorRole === 'owner' ? <option value="owner">Owner</option> : null}
                  </select>
                ) : (
                  <RoleBadge role={member.role} />
                )}
                {self || canEditTarget ? (
                  <button
                    className="btn-quiet"
                    type="button"
                    onClick={() => {
                      const prompt = self ? 'Leave this workspace?' : `Remove ${member.user.name} from the workspace?`;
                      if (window.confirm(prompt)) remove.mutate(member.user.id);
                    }}
                  >
                    {self ? 'Leave' : 'Remove'}
                  </button>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
      {invites.data?.length ? (
        <section>
          <h2 className="mb-3 font-semibold">Pending invites</h2>
          <ul className="panel divide-y divide-white/5">
            {invites.data.map((inviteItem) => (
              <li key={inviteItem.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span>
                  {inviteItem.email} · {inviteItem.role}
                </span>
                <button className="btn-quiet" type="button" onClick={() => api.revokeInvite(workspaceId, inviteItem.id).then(() => queryClient.invalidateQueries({ queryKey: ['invites', workspaceId] }))}>
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
