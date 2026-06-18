import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import dbConnect from './db'

// User model is dynamically imported inside authorize to prevent
// mongoose.models from being accessed at module evaluation time (Turbopack issue)
export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        phone: { label: 'Phone', type: 'text' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.phone || !credentials?.password) return null

        await dbConnect()
        const { default: User } = await import('@/models/User')

        const user = await User.findOne({
          phone: credentials.phone,
          isActive: true
        }).lean() as any

        if (!user) return null

        const isValid = await bcrypt.compare(credentials.password, user.passwordHash)
        if (!isValid) return null

        return {
          id: user._id.toString(),
          name: user.name,
          phone: user.phone,
          role: user.role,
          assignedBranches: (user.assignedBranches as any[]).map((b) => b.toString())
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.assignedBranches = user.assignedBranches
        token.phone = user.phone
      }
      return token
    },
    async session({ session, token }) {
      session.user.id = token.id
      session.user.role = token.role
      session.user.assignedBranches = token.assignedBranches
      session.user.phone = token.phone
      return session
    }
  },
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  secret: process.env.NEXTAUTH_SECRET
}
