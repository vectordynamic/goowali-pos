import type { DefaultSession, DefaultJWT } from 'next-auth'
import type { Role } from './index'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      phone: string
      role: Role
      assignedBranches: string[]
    } & DefaultSession['user']
  }

  interface User {
    id: string
    phone: string
    role: Role
    assignedBranches: string[]
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id: string
    phone: string
    role: Role
    assignedBranches: string[]
  }
}
