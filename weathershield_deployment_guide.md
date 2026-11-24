# Deployment & Environment Configuration Guide
## WeatherShield Production Setup

---

## 1. Prerequisites
* Node.js v18.x or v20.x installed locally.
* Git installed.
* GitHub Account & Vercel / Render account for hosting.

---

## 2. Local Setup & Production Build Test

1. **Clone & Install Dependencies:**
   ```bash
   git clone https://github.com/your-username/weathershield.git
   cd weathershield
   npm install
   ```
2. **Configure Environment Variables:**
   Create a local `.env` file in the project root:
   ```env
   # Database Connection
   DATABASE_URL="file:./dev.db"

   # App Configuration
   NEXT_PUBLIC_APP_URL="http://localhost:3000"
   NODE_ENV="development"
   ```
3. **Database Initialization:**
   ```bash
   npx prisma migrate dev --name init
   npx prisma db seed
   ```
4. **Test Production Build Locally:**
   ```bash
   npm run build
   npm run start
   ```

---

## 3. Live Deployment Procedure (Vercel)

1. **Push Repository to GitHub:**
   Ensure `dev.db` and `.env` are listed inside `.gitignore`. **NEVER commit passwords or keys.**
   ```bash
   git add .
   git commit -m "feat: complete WeatherShield hackathon submission build"
   git push origin main
   ```
2. **Import Project to Vercel:**
   * Go to [Vercel Dashboard](https://vercel.com) and click **"Add New Project"**.
   * Import your `weathershield` GitHub repository.
3. **Set Environment Variables in Vercel:**
   * Set `DATABASE_URL` to your production database URL (or use Postgres / Supabase URL).
   * For zero-config SQLite on Vercel deployment, PostgreSQL via Supabase or Neon is recommended.
4. **Deploy:**
   * Click **Deploy**. Vercel will execute `npm run build` (which runs `prisma generate && next build`).
   * Verify the live URL (e.g., `https://weathershield-hackathon.vercel.app`).

---

## 4. Submission Checklist Verification
* [x] Live URL opens without SSL or CORS errors.
* [x] Seed data or clear "Demo Reset" button exists so judges can immediately test the app.
* [x] GitHub repository is set to **PUBLIC**.
* [x] README contains clean project overview, architecture diagram, and local setup steps.