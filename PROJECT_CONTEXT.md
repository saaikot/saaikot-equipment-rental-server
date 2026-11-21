# 🚀 Project: RentEasy (Equipment Rental Platform)
This file contains the master context, rules, and progress for the RentEasy assignment.

## 👤 User & Git Information
- **GitHub Username:** saaikot
- **Git Email:** labibferdous14@gmail.com
- **Repos:** `saaikot-equipment-rental-server`, `saaikot-equipment-rental-client`
- **Local Paths:** `D:\personal\saaikot-equipment-rental-server` & `D:\personal\saaikot-equipment-rental-client`
- **Editor:** VS Code

## 🛠️ Tech Stack & Tools
- **Frontend:** Next.js 14 (App Router), TypeScript, ShadCN UI, Framer Motion
- **Backend:** Express.js (JavaScript), MongoDB (Mongoose)
- **Auth:** BetterAuth (JWT plugin, JWKS verify in Express, Google OAuth)
- **Payment:** Stripe (Test Mode)
- **Images:** Local folder paths (no ImgBB). Equipment images will be direct URLs.

## ⚠️ Strict Rules for AI
1. Follow all assignment requirements (20+ client commits, 12+ server commits).
2. All NEW files must have a `rental-` prefix.
3. Add English comments explaining EVERY function and block.
4. Incremental Work: Small chunks, then `git commit` commands.
5. Context Updates: Always provide an updated version of this file at the end.

## 🗄️ External Services Setup
- **MongoDB Atlas:** Cluster: `bazardor`. User: `renteasy`. DNS fix applied in `index.js`.
- **Google OAuth:** Not created yet (will do in frontend).
- **Stripe:** Keys not set yet in `.env` (will do in frontend).

---

## ✅ Progress Tracker

### Backend (100% COMPLETE)
- **Models:** `user`, `equipment`, `booking`, `favorite`, `payment`
- **Controllers:** `equipment`, `rental-booking`, `rental-favorite`, `rental-payment`, `rental-analytics`
- **Middlewares:** `verifyToken` (JWKS), `verifyRenter`, `verifyOwner`, `verifyAdmin`
- **Routes:** All API endpoints wired up in `index.js` with proper role-based access.

### Frontend (Next Steps)
- [ ] Next.js + ShadCN setup
- [ ] BetterAuth config (email/pass + Google)
- [ ] Public Pages (Home, All Equipment, Details)
- [ ] Customer Dashboard (My Rentals, Favorites, Profile)
- [ ] Owner Dashboard (Add Equipment, My Equipment, My Rentals)
- [ ] Admin Dashboard (Users, Equipment, Rentals, Analytics Charts)
- [ ] Stripe Checkout integration
- [ ] Deployment (Vercel + Render/Railway)