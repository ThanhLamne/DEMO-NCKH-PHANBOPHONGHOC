# Phong-hoc

This is a [Next.js](https://nextjs.org) project bootstrapped with [v0](https://v0.app).

## Built with v0

This repository is linked to a [v0](https://v0.app) project. You can continue developing by visiting the link below -- start new chats to make changes, and v0 will push commits directly to this repo. Every merge to `main` will automatically deploy.

[Continue working on v0 →](https://v0.app/chat/projects/prj_OyQqu6BNXfHVciLxQxQC3axHKdPT)

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Authentication setup

All three portals use Supabase Auth. Student and lecturer accounts can register
from their respective portals. Admin registration requires the server-only
invitation code; never expose the Supabase service-role key or invitation code
in a `NEXT_PUBLIC_` variable.

1. Create a Supabase project and run `supabase/schema.sql` in its SQL Editor.
2. Copy `.env.example` to `.env.local` and set:
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the
     Supabase project's API settings.
   - `SUPABASE_SERVICE_ROLE_KEY` from the same settings. This is server-only.
   - `ADMIN_INVITE_CODE` to a random secret of at least 24 characters.
3. In Supabase Authentication URL Configuration, add the local and deployed
   portal URLs to the allowed redirect URLs (for example,
   `http://localhost:3000/**` and your HTTPS deployment URL with `/**`).
   Email confirmation redirects through `/auth/callback`.
4. Restart the Next.js server after changing environment variables.

The database trigger assigns student/lecturer roles from the allowed signup
metadata and grants the admin role only to accounts created by the protected
server route after validating `ADMIN_INVITE_CODE`.

Supabase's built-in email sender has a low project-wide quota (currently 2
messages per hour). Avoid repeated signup attempts; check the inbox and spam
folder, then wait for the quota to reset. For regular use, configure a custom
SMTP provider under **Authentication → SMTP Settings** in Supabase.

## Deploying on Vercel

This app is in the `Phong-hoc` directory of the repository. Set the Vercel Root Directory to `Phong-hoc` and the Framework Preset to `Next.js`. Use the default Next.js build settings (`npm run build`).

## Learn More

To learn more, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [v0 Documentation](https://v0.app/docs) - learn about v0 and how to use it.
