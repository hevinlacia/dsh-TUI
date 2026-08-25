/**
 * Permission-level vocabulary for the `/permission` command. DSH exposes three
 * sandbox modes; switching one drives the session's sandbox mode AND the
 * approval policy (full access turns approval off). The TUI only labels/aliases
 * them; the actual effect is the sandbox-policy + approval switch in the
 * controller. Pure module, no official imports (the controller maps to the
 * official types).
 * @module dsh-tui/permission
 */

/** The three DSH permission/sandbox levels. */
export type PermissionMode = 'read-only' | 'workspace-write' | 'danger-full-access'

/** One selectable permission level. */
export interface PermissionLevel {
  mode: PermissionMode
  /** Short display label (how `/permission <arg>` resolves). */
  label: string
  description: string
}

/** The three selectable levels, in order. */
export const PERMISSION_LEVELS: PermissionLevel[] = [
  { mode: 'read-only', label: 'read-only', description: '只读（仅必要系统端口）' },
  { mode: 'workspace-write', label: 'workspace', description: '工作区可写（默认）' },
  { mode: 'danger-full-access', label: 'full', description: '完全访问（无确认）' },
]

/** Deployment default when a session has no override. */
export const DEFAULT_PERMISSION: PermissionMode = 'workspace-write'

/** Human label for a mode (used in status/notices). */
export function permissionLabel(mode: PermissionMode): string {
  return PERMISSION_LEVELS.find(level => level.mode === mode)?.label ?? mode
}

/** Resolve a `/permission <arg>` to a mode (accepts full name + short alias). */
export function resolvePermission(value: string): PermissionMode | undefined {
  const needle = value.trim().replace(/^\/+/u, '').replace(/[-_]/gu, '').toLowerCase()
  const aliases: Record<string, PermissionMode> = {
    read: 'read-only', readonly: 'read-only', ro: 'read-only',
    workspacewrite: 'workspace-write', workspace: 'workspace-write', ws: 'workspace-write', write: 'workspace-write',
    dangerfullaccess: 'danger-full-access', danger: 'danger-full-access', full: 'danger-full-access', f: 'danger-full-access', all: 'danger-full-access',
  }
  return aliases[needle]
}

/** The approval policy matching a permission level (full access never asks). */
export function approvalPolicyFor(mode: PermissionMode): 'ask' | 'never' {
  return mode === 'danger-full-access' ? 'never' : 'ask'
}
