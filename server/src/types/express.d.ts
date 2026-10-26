import type { Role } from '../constants';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
      membershipRole?: Role;
    }
  }
}

export {};
