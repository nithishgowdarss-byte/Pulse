import { UserRole, Permission } from '../types';

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  super_owner: [
    'members.view',
    'members.create',
    'members.edit',
    'members.export',
    'members.transfer',
    'payments.manage',
    'analytics.view',
    'branches.manage',
    'leads.manage',
    'automations.manage',
    'settlements.manage',
    'audit.view'
  ],
  owner: [
    'members.view',
    'members.create',
    'members.edit',
    'members.export',
    'members.transfer',
    'payments.manage',
    'analytics.view',
    'branches.manage',
    'leads.manage',
    'automations.manage',
    'settlements.manage',
    'audit.view'
  ],
  branch_manager: [
    'members.view',
    'members.create',
    'members.edit',
    'members.export',
    'payments.manage',
    'analytics.view',
    'leads.manage',
    'settlements.manage'
  ],
  trainer: [
    'members.view',
    'members.create',
    'members.edit',
    'members.export',
    'leads.manage'
  ],
  member: [
    'members.view'
  ]
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role] || [];
  return perms.includes(permission);
}

export function getRoleDisplayName(role: UserRole): string {
  switch (role) {
    case 'super_owner':
      return 'Super Owner (Franchise HQ)';
    case 'owner':
      return 'Gym Owner';
    case 'branch_manager':
      return 'Branch Manager';
    case 'trainer':
      return 'Fitness Trainer';
    case 'member':
      return 'Member';
    default:
      return role;
  }
}
