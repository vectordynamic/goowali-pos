export async function register() {
  // Mongoose doesn't work in the Edge runtime — Node.js only
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { seedAdmin } = await import('./lib/seed-admin')
    await seedAdmin()
  }
}
