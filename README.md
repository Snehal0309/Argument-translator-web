# Argue in any language

Two people, two languages, one live argument. Next.js client + Socket.io server.

## Run locally
cd server && npm i && GEMINI_API_KEY=xxx npm run dev
cd web && npx create-next-app@latest . --ts --app (say no to extras), copy app/page.tsx over, then:
NEXT_PUBLIC_SERVER_URL=http://localhost:4000 npm run dev
Open two tabs (use headphones), same ?room=abc, different languages.

## Deploy (free)
- server/ -> Render (Web Service, free). Build: npm install, Start: npm start.
  Env: GEMINI_API_KEY, CLIENT_ORIGIN=<your vercel url>. Ping /health every 5 min with UptimeRobot.
- web/ -> Vercel. Env: NEXT_PUBLIC_SERVER_URL=<your render url>.
