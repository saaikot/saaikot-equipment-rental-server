# 🚀 Project: RentEasy (Equipment Rental Platform)
This file contains the master context, rules, and progress for the RentEasy assignment. If a new AI chat or agent is opened, provide this file as the first prompt.

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
- **Images:** Local folder paths for static assets (e.g., `/images/banner.jpg`). No ImgBB. Equipment images will be direct URLs.

## ⚠️ Strict Rules for AI
1. **No Shortcuts:** Follow all assignment requirements (20+ client commits, 12+ server commits).
2. **Naming:** All NEW files must have a `rental-` prefix (e.g., `rental-booking.controller.js`) to avoid similarity flags.
3. **Comments:** Add English comments explaining EVERY function and block.
4. **No ImgBB:** Use normal image URLs for equipment.
5. **Incremental Work:** Provide code in small chunks. Give `git commit` commands after every major step.
6. **Error-Free:** Provide complete, copy-pasteable code. 
7. **Context Updates:** At the end of every Part, provide an updated version of this `PROJECT_CONTEXT.md` file.

## 🗄️ External Services Setup
- **MongoDB Atlas:** Connected. Cluster: `bazardor`. User: `renteasy`. Pass: `renteasy1490`.
  - *Fix applied:* DNS forced to `8.8.8.8` in `index.js` to resolve SRV records.
- **Google OAuth:** Not created yet (will do later).
- **Stripe:** Keys not set yet (will do later).

---

## ✅ Progress Tracker (Backend)

### Part 1 & 2: Foundation & Equipment (Completed)
- `index.js`: Express setup, CORS, DNS fix, Error handlers.
- `config/db.js`: MongoDB connection.
- `models/user.model.js`: BetterAuth compatible schema.
- `middleware/auth.middleware.js`: `verifyToken` (JWKS), `verifyRenter`, `verifyOwner`, `verifyAdmin`.
- `models/equipment.model.js`: Equipment schema with approval status.
- `controllers/equipment.controller.js`: CRUD + Search/Filter/Sort (Challenge 1) + Admin Approve/Reject.
- `routes/equipment.routes.js` & `user.routes.js`: API endpoints.

### Part 3: Booking System (Completed)
- `models/booking.model.js`: Booking schema with statuses.
- `controllers/rental-booking.controller.js`: Create (with availability & total price calc), Get Customer/Owner/Admin lists, Update Status.
- `routes/rental-booking.routes.js`: Role-based endpoints.

### Part 4: Favorites & Payments (Upcoming)
- [ ] Favorite Model & Routes
- [ ] Payment Model & Stripe Controller (Checkout + Webhook)
- [ ] Analytics Controller (Admin & Owner - Challenge 3)
- [ ] Final Backend `index.js` wiring

### Part 5: Frontend (Upcoming)
- [ ] Next.js + ShadCN setup
- [ ] BetterAuth config (email/pass + Google)
- [ ] Public Pages (Home, All Equipment, Details)
- [ ] Customer Dashboard (My Rentals, Favorites, Profile)
- [ ] Owner Dashboard (Add Equipment, My Equipment, My Rentals)
- [ ] Admin Dashboard (Users, Equipment, Rentals, Analytics Charts)
- [ ] Stripe Checkout integration
- [ ] Deployment (Vercel + Render/Railway)