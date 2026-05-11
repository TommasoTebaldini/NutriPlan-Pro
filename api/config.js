// Returns public client-side configuration from Vercel environment variables.
// Set GOOGLE_CLIENT_ID in the Vercel project environment variables dashboard.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json({
    googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || ''
  });
}
