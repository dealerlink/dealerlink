'use client';

import * as React from 'react';
import { useState, useTransition } from 'react';

import { KeyRound, Plus, RotateCw, UserCog, UserMinus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';

import {
  createTenantUser,
  deactivateTenantUser,
  resetTenantUserPassword,
  updateTenantUser,
} from '@/lib/actions/admin/tenant-users';

interface TenantUserRow {
  id: string;
  email: string;
  role: string;
  fullName: string;
  status: string;
  mustChangePassword: boolean;
  lastAuthEventAt: string | null;
  createdAt: string;
}

interface Props {
  tenantId: string;
  tenantSlug: string;
  initialUsers: TenantUserRow[];
}

const ROLES = ['admin', 'sales', 'accounts', 'dispatch'] as const;
const inputClass =
  'border-line text-ink placeholder:text-mute focus:ring-accent focus:border-accent flex h-[32px] w-full rounded-[5px] border bg-white px-3 text-[13px] focus:outline-none focus:ring-1';

export function TenantUsersPanel({ tenantId, initialUsers }: Props) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [revealed, setRevealed] = useState<{
    email: string;
    password: string;
    loginUrl: string;
  } | null>(null);

  return (
    <div className="mt-8">
      <div className="flex items-center justify-end">
        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="border-accent bg-accent inline-flex h-9 items-center gap-2 rounded-[6px] border px-3 text-[12.5px] font-medium text-white hover:bg-[var(--accent-2)]"
          >
            <Plus size={13} /> Add user
          </button>
        ) : null}
      </div>

      {adding ? (
        <AddUserForm
          tenantId={tenantId}
          onCancel={() => setAdding(false)}
          onCreated={(out) => {
            setAdding(false);
            setRevealed({
              email: out.email,
              password: out.temporaryPassword,
              loginUrl: out.loginUrl,
            });
            router.refresh();
          }}
        />
      ) : null}

      {revealed ? <CredentialsCard {...revealed} onClose={() => setRevealed(null)} /> : null}

      <section className="hairline mt-6 rounded-[8px] bg-white">
        <div className="table-head grid grid-cols-[1.6fr_1fr_0.6fr_0.6fr_120px] px-4 py-2.5">
          <div>User</div>
          <div>Email</div>
          <div>Role</div>
          <div>Status</div>
          <div className="text-right">Actions</div>
        </div>
        {initialUsers.length === 0 ? (
          <div className="text-mute border-line border-t px-4 py-6 text-center text-[13px]">
            No users yet. Add the first one above.
          </div>
        ) : (
          initialUsers.map((u) => (
            <UserRow
              key={u.id}
              tenantId={tenantId}
              user={u}
              onChanged={() => router.refresh()}
              onReset={(out) =>
                setRevealed({
                  email: out.email,
                  password: out.temporaryPassword,
                  loginUrl: out.loginUrl,
                })
              }
            />
          ))
        )}
      </section>
    </div>
  );
}

function AddUserForm({
  tenantId,
  onCancel,
  onCreated,
}: {
  tenantId: string;
  onCancel: () => void;
  onCreated: (out: { email: string; temporaryPassword: string; loginUrl: string }) => void;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<(typeof ROLES)[number]>('sales');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await createTenantUser({ tenantId, fullName, email, role });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      onCreated({
        email: result.data.email,
        temporaryPassword: result.data.temporaryPassword,
        loginUrl: result.data.loginUrl,
      });
    });
  };

  return (
    <section className="hairline mt-4 rounded-[8px] bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="titlecaps">Add user</div>
        <button
          type="button"
          onClick={onCancel}
          className="text-mute hover:text-ink inline-flex h-7 items-center gap-1 rounded-[5px] px-2 text-[12px]"
        >
          <X size={12} /> Cancel
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <label className="text-mute text-[11.5px] font-medium">Full name</label>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={inputClass}
            placeholder="Priya Sharma"
          />
        </div>
        <div>
          <label className="text-mute text-[11.5px] font-medium">Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="priya@acme.in"
          />
        </div>
        <div>
          <label className="text-mute text-[11.5px] font-medium">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])}
            className={inputClass}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error ? <div className="mt-2 text-[12px] text-[var(--rose)]">{error}</div> : null}
      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending || !fullName || !email}
          className="border-accent bg-accent inline-flex h-8 items-center gap-1 rounded-[5px] border px-3 text-[12.5px] font-medium text-white hover:bg-[var(--accent-2)] disabled:opacity-60"
        >
          {pending ? 'Creating…' : 'Create user'}
        </button>
      </div>
    </section>
  );
}

function UserRow({
  tenantId,
  user,
  onChanged,
  onReset,
}: {
  tenantId: string;
  user: TenantUserRow;
  onChanged: () => void;
  onReset: (out: { email: string; temporaryPassword: string; loginUrl: string }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(user.fullName);
  const [role, setRole] = useState<(typeof ROLES)[number]>(
    (ROLES as readonly string[]).includes(user.role)
      ? (user.role as (typeof ROLES)[number])
      : 'sales',
  );
  const [status, setStatus] = useState<'active' | 'suspended'>(
    user.status === 'suspended' ? 'suspended' : 'active',
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dot = user.status === 'active' ? 's-em' : user.status === 'suspended' ? 's-ro' : 's-am';

  return (
    <div className="border-line grid grid-cols-[1.6fr_1fr_0.6fr_0.6fr_120px] items-center gap-2 border-t px-4 py-3 text-[13px]">
      {editing ? (
        <>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={inputClass}
          />
          <div className="mono text-mute break-all text-[12px]">{user.email}</div>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])}
            className={inputClass}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as 'active' | 'suspended')}
            className={inputClass}
          >
            <option value="active">active</option>
            <option value="suspended">suspended</option>
          </select>
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setFullName(user.fullName);
                setError(null);
              }}
              disabled={pending}
              className="text-mute hover:text-ink inline-flex h-7 items-center gap-1 rounded-[5px] px-2 text-[12px]"
            >
              <X size={11} /> Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const result = await updateTenantUser({
                    tenantId,
                    userId: user.id,
                    fullName,
                    role,
                    status,
                  });
                  if (!result.ok) {
                    setError(result.error.message);
                    return;
                  }
                  setEditing(false);
                  onChanged();
                });
              }}
              disabled={pending}
              className="border-accent bg-accent inline-flex h-7 items-center gap-1 rounded-[5px] border px-2 text-[12px] font-medium text-white hover:bg-[var(--accent-2)] disabled:opacity-60"
            >
              {pending ? 'Saving…' : 'Save'}
            </button>
          </div>
          {error ? (
            <div className="col-span-5 text-[11.5px] text-[var(--rose)]">{error}</div>
          ) : null}
        </>
      ) : (
        <>
          <div>
            <div className="font-medium">{user.fullName}</div>
            {user.mustChangePassword ? (
              <div className="text-[11px] text-[var(--amber)]">↻ password rotation pending</div>
            ) : null}
          </div>
          <div className="mono text-mute break-all text-[12px]">{user.email}</div>
          <div className="capitalize">{user.role}</div>
          <div>
            <span className="chip">
              <span className={`dot ${dot}`} /> {user.status}
            </span>
          </div>
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={() => setEditing(true)}
              title="Edit"
              className="text-mute hover:text-ink inline-flex h-7 w-7 items-center justify-center rounded-[5px]"
            >
              <UserCog size={13} />
            </button>
            <button
              type="button"
              title="Reset password"
              onClick={() => {
                if (
                  !confirm(
                    `Reset password for ${user.email}? Existing sessions will be terminated and a temporary password emailed.`,
                  )
                ) {
                  return;
                }
                startTransition(async () => {
                  const result = await resetTenantUserPassword({ tenantId, userId: user.id });
                  if (!result.ok) {
                    alert(result.error.message);
                    return;
                  }
                  onReset({
                    email: result.data.email,
                    temporaryPassword: result.data.temporaryPassword,
                    loginUrl: result.data.loginUrl,
                  });
                  onChanged();
                });
              }}
              disabled={pending}
              className="text-mute hover:text-ink inline-flex h-7 w-7 items-center justify-center rounded-[5px]"
            >
              <KeyRound size={13} />
            </button>
            <button
              type="button"
              title="Deactivate"
              onClick={() => {
                if (user.status === 'suspended') return;
                if (!confirm(`Deactivate ${user.email}? Sessions will be terminated.`)) return;
                startTransition(async () => {
                  const result = await deactivateTenantUser({ tenantId, userId: user.id });
                  if (!result.ok) {
                    alert(result.error.message);
                    return;
                  }
                  onChanged();
                });
              }}
              disabled={pending || user.status === 'suspended'}
              className="text-mute inline-flex h-7 w-7 items-center justify-center rounded-[5px] hover:text-[var(--rose)] disabled:opacity-40"
            >
              <UserMinus size={13} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function CredentialsCard({
  email,
  password,
  loginUrl,
  onClose,
}: {
  email: string;
  password: string;
  loginUrl: string;
  onClose: () => void;
}) {
  return (
    <div className="mt-6 rounded-[8px] border border-[var(--emerald)] bg-[#ecfdf5] p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-[14px] font-semibold text-[var(--emerald)]">
            <RotateCw size={14} /> Temporary credentials (shown once)
          </div>
          <p className="text-mute mt-1 text-[12.5px]">
            Also sent by email. The user must rotate the password on first login.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-mute hover:text-ink h-6 w-6 rounded-[4px]"
        >
          <X size={13} />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="hairline rounded-[5px] bg-white px-3 py-2">
          <div className="text-mute text-[11px] uppercase tracking-[0.08em]">Email</div>
          <div className="mt-1 text-[13px]">{email}</div>
        </div>
        <div className="hairline rounded-[5px] bg-white px-3 py-2">
          <div className="text-mute text-[11px] uppercase tracking-[0.08em]">
            Temporary password
          </div>
          <div className="mono mt-1 text-[13px]">{password}</div>
        </div>
        <div className="hairline rounded-[5px] bg-white px-3 py-2 md:col-span-2">
          <div className="text-mute text-[11px] uppercase tracking-[0.08em]">Login URL</div>
          <div className="mono mt-1 break-all text-[12.5px]">{loginUrl}</div>
        </div>
      </div>
    </div>
  );
}
