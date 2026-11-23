// End-to-end API tests: fake BetterAuth JWKS + real test database + real Stripe
// webhook signing. Run with: npm test
const {
  loadEnvironment,
  startJwksServer,
  signToken,
  startApp,
  makeClient,
  createReporter,
  cleanDatabase,
} = require("./helpers");

const testInfo = loadEnvironment("api");

const isoDate = (daysFromNow) => {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
};

const run = async () => {
  const reporter = createReporter();
  const { check } = reporter;

  console.log(`\n▶ API integration tests (db: ${testInfo.dbName})`);

  const jwks = await startJwksServer();
  process.env.BETTER_AUTH_URL = jwks.url;

  const config = require("../config/env");
  const mongoose = require("mongoose");
  const connectDB = require("../config/db");
  const { disconnectDB } = require("../config/db");
  const User = require("../models/user.model");
  const Equipment = require("../models/equipment.model");
  const Booking = require("../models/booking.model");
  const Payment = require("../models/payment.model");
  const Favorite = require("../models/favorite.model");
  const Stripe = require("stripe");

  const app = require("../index");
  const server = await startApp(app);
  const client = makeClient(server.base);

  let exitCode = 0;

  try {
    await connectDB();
    await cleanDatabase(mongoose.connection);
    await Promise.all([
      User.init(),
      Equipment.init(),
      Booking.init(),
      Payment.init(),
      Favorite.init(),
    ]);

    // -------------------------------------------------------------------
    // Seed users and equipment directly (authentication is exercised through
    // signed JWTs, so we only need the shared `user` collection).
    // -------------------------------------------------------------------
    const users = {
      customer1: {
        _id: "test_customer_1",
        name: "Customer One",
        email: "customer1@test.local",
        role: "customer",
        emailVerified: true,
        createdAt: new Date(),
      },
      customer2: {
        _id: "test_customer_2",
        name: "Customer Two",
        email: "customer2@test.local",
        role: "customer",
        emailVerified: true,
        createdAt: new Date(),
      },
      owner1: {
        _id: "test_owner_1",
        name: "Owner One",
        email: "owner1@test.local",
        role: "owner",
        emailVerified: true,
        createdAt: new Date(),
      },
      admin1: {
        _id: "test_admin_1",
        name: "Admin One",
        email: "admin1@test.local",
        role: "admin",
        emailVerified: true,
        createdAt: new Date(),
      },
      temp: {
        _id: "test_temp_1",
        name: "Temp User",
        email: "temp@test.local",
        role: "customer",
        emailVerified: true,
        createdAt: new Date(),
      },
    };
    await User.create(Object.values(users));

    const tokens = {};
    for (const [key, user] of Object.entries(users)) {
      tokens[key] = await signToken(jwks.privateKey, user);
    }

    const equipmentBase = {
      description: "A reliable test item used by the integration suite.",
      category: "Photography Equipment",
      location: "Test City",
      price: 100,
      rentalType: "Daily",
      availableQuantity: 5,
      condition: "Excellent",
      brand: "TestBrand",
      model: "T1",
      imageURL: "/images/equipment/test.jpg",
      rentalTerms: "Return on time.",
      status: "approved",
      ownerId: users.owner1._id,
      ownerName: users.owner1.name,
      ownerEmail: users.owner1.email,
    };

    const eq1 = await Equipment.create({ ...equipmentBase, name: "Test Camera" });
    const eqPending = await Equipment.create({
      ...equipmentBase,
      name: "Pending Camera",
      status: "pending",
    });
    const eqDelete = await Equipment.create({
      ...equipmentBase,
      name: "Deletable Tripod",
      price: 50,
      availableQuantity: 1,
    });

    // -------------------------------------------------------------------
    // Health, CORS, request ids, 404 and malformed JSON
    // -------------------------------------------------------------------
    console.log("\n▶ Infrastructure");
    {
      const res = await client("GET", "/");
      check("GET / returns 200", res.status === 200, res.status);
      check("GET / reports ok", res.body?.status === "ok", res.body);
      check("X-Request-Id header is set", Boolean(res.header("x-request-id")));
      check("X-Powered-By is hidden", !res.header("x-powered-by"));

      const health = await client("GET", "/api/health");
      check("GET /api/health returns 200", health.status === 200, health.body);
      check("health reports connected db", health.body?.database === "connected", health.body);

      const preflight = await client("OPTIONS", "/api/equipment", {
        origin: "http://localhost:3000",
        headers: {
          "access-control-request-method": "GET",
          "access-control-request-headers": "authorization,content-type",
        },
      });
      check("CORS preflight returns 204", preflight.status === 204, preflight.status);
      check(
        "CORS preflight allows configured origin",
        preflight.header("access-control-allow-origin") === "http://localhost:3000",
        preflight.header("access-control-allow-origin")
      );
      check(
        "CORS allows credentials/authorization",
        preflight.header("access-control-allow-credentials") === "true"
      );

      const blocked = await client("GET", "/api/equipment", {
        origin: "https://evil.example",
      });
      check("CORS rejects unknown origin with 403", blocked.status === 403, blocked.status);
      check(
        "CORS does not echo unknown origin",
        blocked.header("access-control-allow-origin") === null
      );

      const allowed = await client("GET", "/api/equipment", {
        origin: "http://localhost:3001",
      });
      check("CORS allows second configured origin", allowed.status === 200, allowed.status);

      const missing = await client("GET", "/api/not-a-route");
      check("unknown route returns JSON 404", missing.status === 404, missing.status);
      check("404 includes the path", missing.body?.path === "/api/not-a-route", missing.body);

      const badJson = await client("POST", "/api/equipment", {
        body: "{ this is not json",
        contentType: "application/json",
      });
      check("malformed JSON returns 400", badJson.status === 400, badJson.body);

      const tooLarge = await client("PUT", "/api/users/me", {
        body: JSON.stringify({ name: "x".repeat(1100 * 1024) }),
        contentType: "application/json",
      });
      check("oversized payload returns 413", tooLarge.status === 413, tooLarge.status);
    }

    // -------------------------------------------------------------------
    // Public equipment catalogue
    // -------------------------------------------------------------------
    console.log("\n▶ Equipment (public)");
    {
      const list = await client("GET", "/api/equipment");
      check("public list returns 200", list.status === 200, list.body);
      check("public list only returns approved items", list.body?.total === 2, list.body?.total);
      check(
        "public list never leaks pending items",
        list.body?.items?.every((item) => item.status === "approved")
      );
      check("public list sets cache headers", Boolean(list.header("cache-control")));

      const search = await client("GET", "/api/equipment?search=Camera");
      check("search matches by name", search.body?.total === 1, search.body?.total);

      const regexSearch = await client("GET", "/api/equipment?search=.*");
      check(
        "regex metacharacters are escaped",
        regexSearch.body?.total === 0,
        regexSearch.body?.total
      );

      const badCategory = await client("GET", "/api/equipment?category=Nope");
      check("invalid category returns 400", badCategory.status === 400, badCategory.status);

      const badRentalType = await client("GET", "/api/equipment?rentalType=Hourly");
      check("invalid rentalType returns 400", badRentalType.status === 400);

      const badPrice = await client("GET", "/api/equipment?minPrice=200&maxPrice=100");
      check("minPrice > maxPrice returns 400", badPrice.status === 400);

      const badSort = await client("GET", "/api/equipment?sort=random");
      check("invalid sort returns 400", badSort.status === 400);

      const capped = await client("GET", "/api/equipment?limit=100000");
      check("pagination limit is capped", capped.status === 200, capped.status);

      const sorted = await client("GET", "/api/equipment?sort=price-low");
      check(
        "price-low sorting works",
        sorted.body?.items?.[0]?.price <= sorted.body?.items?.[1]?.price,
        sorted.body?.items?.map((item) => item.price)
      );

      const featured = await client("GET", "/api/equipment/featured");
      check("featured returns 200", featured.status === 200);
      check("featured is limited to 6", featured.body?.items?.length <= 6);

      const noAuth = await client("GET", `/api/equipment/${eq1._id}`);
      check("equipment detail requires auth", noAuth.status === 401, noAuth.status);

      const detail = await client("GET", `/api/equipment/${eq1._id}`, {
        token: tokens.customer1,
      });
      check("approved detail visible to customer", detail.status === 200, detail.status);

      const pendingHidden = await client("GET", `/api/equipment/${eqPending._id}`, {
        token: tokens.customer1,
      });
      check("pending detail hidden from customer", pendingHidden.status === 404);

      const pendingOwner = await client("GET", `/api/equipment/${eqPending._id}`, {
        token: tokens.owner1,
      });
      check("pending detail visible to owner", pendingOwner.status === 200);

      const pendingAdmin = await client("GET", `/api/equipment/${eqPending._id}`, {
        token: tokens.admin1,
      });
      check("pending detail visible to admin", pendingAdmin.status === 200);

      const badId = await client("GET", "/api/equipment/not-an-id", {
        token: tokens.customer1,
      });
      check("invalid equipment id returns 400", badId.status === 400, badId.status);

      const unknownUserToken = await signToken(jwks.privateKey, {
        _id: "does_not_exist",
        name: "Ghost",
        email: "ghost@test.local",
        role: "customer",
      });
      const ghost = await client("GET", `/api/equipment/${eq1._id}`, {
        token: unknownUserToken,
      });
      check("token without a database user returns 401", ghost.status === 401, ghost.status);

      const badToken = await client("GET", `/api/equipment/${eq1._id}`, {
        headers: { authorization: "Bearer definitely-not-a-jwt" },
      });
      check("invalid JWT returns 401", badToken.status === 401, badToken.status);
      check(
        "401 does not leak internal error details",
        !JSON.stringify(badToken.body).includes("JSONWebTokenError"),
        badToken.body
      );
    }

    // -------------------------------------------------------------------
    // Equipment writes / admin moderation
    // -------------------------------------------------------------------
    console.log("\n▶ Equipment (owner/admin)");
    {
      const customerCreate = await client("POST", "/api/equipment", {
        token: tokens.customer1,
        json: { name: "Nope" },
      });
      check("customer cannot create equipment", customerCreate.status === 403);

      const missingFields = await client("POST", "/api/equipment", {
        token: tokens.owner1,
        json: { name: "Incomplete" },
      });
      check("owner create validates required fields", missingFields.status === 400);

      const created = await client("POST", "/api/equipment", {
        token: tokens.owner1,
        json: {
          ...equipmentBase,
          name: "Zero Stock Camera",
          availableQuantity: 0,
        },
      });
      check("owner can create equipment", created.status === 201, created.body);
      check(
        "availableQuantity: 0 is preserved",
        created.body?.equipment?.availableQuantity === 0,
        created.body?.equipment?.availableQuantity
      );
      check("new equipment starts pending", created.body?.equipment?.status === "pending");

      const mine = await client("GET", "/api/equipment/owner/my", {
        token: tokens.owner1,
      });
      check("owner sees own equipment", mine.status === 200 && mine.body?.items?.length >= 3);

      const forbiddenApprove = await client("PATCH", `/api/equipment/${eq1._id}/approve`, {
        token: tokens.owner1,
      });
      check("owner cannot approve equipment", forbiddenApprove.status === 403);

      const approve = await client("PATCH", `/api/equipment/${eq1._id}/approve`, {
        token: tokens.admin1,
      });
      check("admin can approve equipment", approve.status === 200, approve.body);
      check("approve sets status", approve.body?.equipment?.status === "approved");

      const badApproveId = await client("PATCH", "/api/equipment/bad-id/approve", {
        token: tokens.admin1,
      });
      check("approve with invalid id returns 400", badApproveId.status === 400);

      const missingApprove = await client(
        "PATCH",
        "/api/equipment/64b000000000000000000000/approve",
        { token: tokens.admin1 }
      );
      check("approve missing equipment returns 404", missingApprove.status === 404);

      const update = await client("PUT", `/api/equipment/${eq1._id}`, {
        token: tokens.owner1,
        json: { description: "Updated by owner." },
      });
      check("owner can update equipment", update.status === 200, update.body);
      check(
        "owner content edits require re-approval",
        update.body?.equipment?.status === "pending",
        update.body?.equipment?.status
      );

      const reApprove = await client("PATCH", `/api/equipment/${eq1._id}/approve`, {
        token: tokens.admin1,
      });
      check("admin can re-approve equipment", reApprove.status === 200);

      const stockOnly = await client("PUT", `/api/equipment/${eq1._id}`, {
        token: tokens.owner1,
        json: { availableQuantity: 5 },
      });
      check(
        "stock-only edits keep approval",
        stockOnly.body?.equipment?.status === "approved",
        stockOnly.body?.equipment?.status
      );

      const emptyUpdate = await client("PUT", `/api/equipment/${eq1._id}`, {
        token: tokens.owner1,
        json: { unknownField: "ignored" },
      });
      check("empty update returns 400", emptyUpdate.status === 400);

      const customerUpdate = await client("PUT", `/api/equipment/${eq1._id}`, {
        token: tokens.customer1,
        json: { description: "hacked" },
      });
      check("customer cannot edit equipment", customerUpdate.status === 403);
    }

    // -------------------------------------------------------------------
    // Users
    // -------------------------------------------------------------------
    console.log("\n▶ Users");
    {
      const me = await client("GET", "/api/users/me", { token: tokens.customer1 });
      check("GET /users/me works", me.status === 200 && me.body?.user?.email === users.customer1.email);

      const update = await client("PUT", "/api/users/me", {
        token: tokens.customer1,
        json: { name: "Customer One Updated", phone: "+1 555 0100" },
      });
      check("profile update works", update.status === 200, update.body);

      const invalidName = await client("PUT", "/api/users/me", {
        token: tokens.customer1,
        json: { name: "x" },
      });
      check("short profile name rejected", invalidName.status === 400);

      const massAssignment = await client("PUT", "/api/users/me", {
        token: tokens.customer1,
        json: { role: "admin" },
      });
      check("role cannot be self-assigned", massAssignment.status === 400);

      const forbiddenList = await client("GET", "/api/users/admin/all", {
        token: tokens.customer1,
      });
      check("customer cannot list users", forbiddenList.status === 403);

      const all = await client("GET", "/api/users/admin/all", { token: tokens.admin1 });
      check("admin can list users", all.status === 200 && all.body?.users?.length >= 5);
      check(
        "user list omits secrets",
        all.body?.users?.every((user) => !("password" in user) && !("accountId" in user))
      );

      const selfRole = await client("PATCH", `/api/users/${users.admin1._id}/role`, {
        token: tokens.admin1,
        json: { role: "customer" },
      });
      check("admin cannot change own role", selfRole.status === 400);

      const badRole = await client("PATCH", `/api/users/${users.customer1._id}/role`, {
        token: tokens.admin1,
        json: { role: "superuser" },
      });
      check("invalid role rejected", badRole.status === 400);

      const promote = await client("PATCH", `/api/users/${users.customer2._id}/role`, {
        token: tokens.admin1,
        json: { role: "owner" },
      });
      check("admin can change roles", promote.status === 200 && promote.body?.user?.role === "owner");

      const demote = await client("PATCH", `/api/users/${users.customer2._id}/role`, {
        token: tokens.admin1,
        json: { role: "customer" },
      });
      check("role change can be reverted", demote.status === 200);

      const selfDelete = await client("DELETE", `/api/users/${users.admin1._id}`, {
        token: tokens.admin1,
      });
      check("admin cannot delete own account", selfDelete.status === 400);

      const deleteTemp = await client("DELETE", `/api/users/${users.temp._id}`, {
        token: tokens.admin1,
      });
      check("admin can delete another account", deleteTemp.status === 200, deleteTemp.body);
      check("deleted user is gone", (await User.findById(users.temp._id)) === null);
    }

    // -------------------------------------------------------------------
    // Favorites
    // -------------------------------------------------------------------
    console.log("\n▶ Favorites");
    {
      const add = await client("POST", "/api/favorites", {
        token: tokens.customer1,
        json: { equipmentId: String(eq1._id) },
      });
      check("customer can favorite equipment", add.status === 201, add.body);

      const duplicate = await client("POST", "/api/favorites", {
        token: tokens.customer1,
        json: { equipmentId: String(eq1._id) },
      });
      check("duplicate favorite is idempotent", [200, 201].includes(duplicate.status));

      const list = await client("GET", "/api/favorites", { token: tokens.customer1 });
      check("favorites list returns one item", list.body?.favorites?.length === 1, list.body);

      const ownerForbidden = await client("POST", "/api/favorites", {
        token: tokens.owner1,
        json: { equipmentId: String(eq1._id) },
      });
      check("owner cannot use customer favorites", ownerForbidden.status === 403);

      const badId = await client("DELETE", "/api/favorites/not-an-id", {
        token: tokens.customer1,
      });
      check("favorite delete validates id", badId.status === 400);

      const remove = await client("DELETE", `/api/favorites/${eq1._id}`, {
        token: tokens.customer1,
      });
      check("favorite can be removed", remove.status === 200);

      const empty = await client("GET", "/api/favorites", { token: tokens.customer1 });
      check("favorites list is empty", empty.body?.favorites?.length === 0);
    }

    // -------------------------------------------------------------------
    // Bookings
    // -------------------------------------------------------------------
    console.log("\n▶ Bookings");
    let booking1;
    let booking2;
    let booking3;
    {
      const noAuth = await client("POST", "/api/bookings", {
        json: { equipmentId: String(eq1._id) },
      });
      check("booking requires auth", noAuth.status === 401);

      const ownerForbidden = await client("POST", "/api/bookings", {
        token: tokens.owner1,
        json: { equipmentId: String(eq1._id) },
      });
      check("owner cannot create customer booking", ownerForbidden.status === 403);

      const missing = await client("POST", "/api/bookings", {
        token: tokens.customer1,
        json: { equipmentId: String(eq1._id) },
      });
      check("booking validates required fields", missing.status === 400);

      const past = await client("POST", "/api/bookings", {
        token: tokens.customer1,
        json: {
          equipmentId: String(eq1._id),
          rentalStartDate: isoDate(-3),
          rentalEndDate: isoDate(1),
          requiredQuantity: 1,
          contactNumber: "555-0100",
          deliveryAddress: "123 Test Street",
        },
      });
      check("past start date rejected", past.status === 400);

      const reversed = await client("POST", "/api/bookings", {
        token: tokens.customer1,
        json: {
          equipmentId: String(eq1._id),
          rentalStartDate: isoDate(5),
          rentalEndDate: isoDate(2),
          requiredQuantity: 1,
          contactNumber: "555-0100",
          deliveryAddress: "123 Test Street",
        },
      });
      check("end date before start rejected", reversed.status === 400);

      const tooMany = await client("POST", "/api/bookings", {
        token: tokens.customer1,
        json: {
          equipmentId: String(eq1._id),
          rentalStartDate: isoDate(2),
          rentalEndDate: isoDate(3),
          requiredQuantity: 99,
          contactNumber: "555-0100",
          deliveryAddress: "123 Test Street",
        },
      });
      check("quantity above stock rejected", tooMany.status === 400);

      const invalidEquipment = await client("POST", "/api/bookings", {
        token: tokens.customer1,
        json: {
          equipmentId: "not-an-id",
          rentalStartDate: isoDate(2),
          rentalEndDate: isoDate(4),
          requiredQuantity: 1,
          contactNumber: "555-0100",
          deliveryAddress: "123 Test Street",
        },
      });
      check("invalid equipment id rejected", invalidEquipment.status === 400);

      const created = await client("POST", "/api/bookings", {
        token: tokens.customer1,
        json: {
          equipmentId: String(eq1._id),
          rentalStartDate: isoDate(2),
          rentalEndDate: isoDate(5),
          requiredQuantity: 2,
          contactNumber: "555-0100",
          deliveryAddress: "123 Test Street",
          additionalNotes: "Handle with care",
        },
      });
      check("customer can create booking", created.status === 201, created.body);
      booking1 = created.body?.booking;
      check("booking total is computed server-side", booking1?.totalAmount === 600, booking1?.totalAmount);
      check("booking starts unpaid/pending", booking1?.paymentStatus === "unpaid" && booking1?.bookingStatus === "pending");

      const mine = await client("GET", "/api/bookings/my-rentals", {
        token: tokens.customer1,
      });
      check("customer sees own rentals", mine.status === 200 && mine.body?.bookings?.length >= 1);

      const otherMine = await client("GET", "/api/bookings/my-rentals", {
        token: tokens.customer2,
      });
      check("other customer sees no rentals", otherMine.body?.bookings?.length === 0);

      const ownerRentals = await client("GET", "/api/bookings/owner-rentals", {
        token: tokens.owner1,
      });
      check("owner sees rentals", ownerRentals.status === 200 && ownerRentals.body?.bookings?.length >= 1);

      const customerAll = await client("GET", "/api/bookings", {
        token: tokens.customer1,
      });
      check("customer cannot list all bookings", customerAll.status === 403);

      const adminAll = await client("GET", "/api/bookings", { token: tokens.admin1 });
      check("admin can list all bookings", adminAll.status === 200);
      check(
        "admin booking list includes owner contact",
        adminAll.body?.bookings?.some((item) => item.ownerName === users.owner1.name)
      );

      const otherView = await client("GET", `/api/bookings/${booking1._id}`, {
        token: tokens.customer2,
      });
      check("other customer cannot view booking", otherView.status === 403);

      const adminView = await client("GET", `/api/bookings/${booking1._id}`, {
        token: tokens.admin1,
      });
      check("admin can view any booking", adminView.status === 200);

      const badStatus = await client("PATCH", `/api/bookings/${booking1._id}/status`, {
        token: tokens.owner1,
        json: { bookingStatus: "teleported" },
      });
      check("invalid booking status rejected", badStatus.status === 400);

      const customerStatus = await client("PATCH", `/api/bookings/${booking1._id}/status`, {
        token: tokens.customer1,
        json: { bookingStatus: "cancelled" },
      });
      check("customer cannot change booking status", customerStatus.status === 403);

      const invalidTransition = await client("PATCH", `/api/bookings/${booking1._id}/status`, {
        token: tokens.owner1,
        json: { bookingStatus: "completed" },
      });
      check("invalid status transition rejected", invalidTransition.status === 400);

      const cancel = await client("PATCH", `/api/bookings/${booking1._id}/status`, {
        token: tokens.owner1,
        json: { bookingStatus: "cancelled", cancellationReason: "Test cleanup" },
      });
      check("owner can cancel booking", cancel.status === 200 && cancel.body?.booking?.bookingStatus === "cancelled");

      const reopen = await client("PATCH", `/api/bookings/${booking1._id}/status`, {
        token: tokens.owner1,
        json: { bookingStatus: "confirmed" },
      });
      check("cancelled booking cannot be reopened", reopen.status === 400);

      const created2 = await client("POST", "/api/bookings", {
        token: tokens.customer1,
        json: {
          equipmentId: String(eq1._id),
          rentalStartDate: isoDate(2),
          rentalEndDate: isoDate(4),
          requiredQuantity: 2,
          contactNumber: "555-0100",
          deliveryAddress: "123 Test Street",
        },
      });
      booking2 = created2.body?.booking;
      check("second booking created", created2.status === 201, created2.body);
      check("second booking total", booking2?.totalAmount === 400, booking2?.totalAmount);

      const created3 = await client("POST", "/api/bookings", {
        token: tokens.customer1,
        json: {
          equipmentId: String(eqDelete._id),
          rentalStartDate: isoDate(2),
          rentalEndDate: isoDate(3),
          requiredQuantity: 1,
          contactNumber: "555-0100",
          deliveryAddress: "123 Test Street",
        },
      });
      booking3 = created3.body?.booking;
      check("third booking created for delete guard", created3.status === 201);
    }

    // -------------------------------------------------------------------
    // Payments
    // -------------------------------------------------------------------
    console.log("\n▶ Payments");
    {
      const noAuth = await client("POST", "/api/payments/create-checkout-session", {
        json: { bookingId: String(booking2._id) },
      });
      check("checkout requires auth", noAuth.status === 401);

      const wrongCustomer = await client("POST", "/api/payments/create-checkout-session", {
        token: tokens.customer2,
        json: { bookingId: String(booking2._id) },
      });
      check("checkout is scoped to the booking owner", wrongCustomer.status === 403);

      const invalidBooking = await client("POST", "/api/payments/create-checkout-session", {
        token: tokens.customer1,
        json: { bookingId: "not-an-id" },
      });
      check("checkout validates booking id", invalidBooking.status === 400);

      let sessionId = null;
      if (config.stripeConfigured) {
        const session = await client("POST", "/api/payments/create-checkout-session", {
          token: tokens.customer1,
          json: { bookingId: String(booking2._id) },
        });
        check(
          "checkout session is created",
          session.status === 200 && typeof session.body?.url === "string",
          session.body
        );
        sessionId = session.body?.sessionId || null;
        check("checkout returns a Stripe session id", Boolean(sessionId));

        if (sessionId) {
          const repeat = await client("POST", "/api/payments/create-checkout-session", {
            token: tokens.customer1,
            json: { bookingId: String(booking2._id) },
          });
          check(
            "checkout is idempotent for the same booking",
            repeat.status === 200 && repeat.body?.url === session.body?.url
          );

          const unpaidVerify = await client("POST", `/api/payments/verify/${sessionId}`, {
            token: tokens.customer1,
            json: {},
          });
          check(
            "verify rejects an unpaid session",
            unpaidVerify.status === 400,
            unpaidVerify.body
          );
        }
      } else {
        const notConfigured = await client("POST", "/api/payments/create-checkout-session", {
          token: tokens.customer1,
          json: { bookingId: String(booking2._id) },
        });
        check("unconfigured Stripe returns 503", notConfigured.status === 503, notConfigured.body);
      }

      const invalidVerify = await client("POST", "/api/payments/verify/not-a-session", {
        token: tokens.customer1,
        json: {},
      });
      check("verify validates session id", invalidVerify.status === 400);

      const stripe = new Stripe("sk_test_dummy");
      const webhookPayload = JSON.stringify({
        id: "evt_test_local_1",
        object: "event",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_test_local_1",
            object: "checkout.session",
            payment_status: "paid",
            amount_total: Math.round(booking2.totalAmount * 100),
            currency: "usd",
            payment_intent: "pi_test_local_1",
            metadata: {
              bookingId: String(booking2._id),
              customerId: users.customer1._id,
            },
          },
        },
      });

      const badSignature = await client("POST", "/api/payments/webhook", {
        body: webhookPayload,
        contentType: "application/json",
        headers: { "stripe-signature": "t=1,v1=deadbeef" },
      });
      check("webhook rejects invalid signatures", badSignature.status === 400, badSignature.status);

      const signature = stripe.webhooks.generateTestHeaderString({
        payload: webhookPayload,
        secret: process.env.STRIPE_WEBHOOK_SECRET,
      });

      const accepted = await client("POST", "/api/payments/webhook", {
        body: webhookPayload,
        contentType: "application/json",
        headers: { "stripe-signature": signature },
      });
      check("webhook accepts a valid signature", accepted.status === 200, accepted.body);

      const paidBooking = await Booking.findById(booking2._id).lean();
      check("webhook marks booking paid", paidBooking?.paymentStatus === "paid");
      check("webhook confirms booking", paidBooking?.bookingStatus === "confirmed");
      check("webhook allocates stock exactly once", paidBooking?.stockAllocated === true);

      const afterPay = await Equipment.findById(eq1._id).lean();
      check("paid booking decrements stock", afterPay?.availableQuantity === 3, afterPay?.availableQuantity);

      const paymentRecord = await Payment.findOne({ bookingId: booking2._id }).lean();
      check("payment record is created", Boolean(paymentRecord));
      check("payment amount is captured", paymentRecord?.amount === 400, paymentRecord?.amount);

      const replay = await client("POST", "/api/payments/webhook", {
        body: webhookPayload,
        contentType: "application/json",
        headers: { "stripe-signature": signature },
      });
      check("webhook replay is acknowledged", replay.status === 200);

      const afterReplay = await Equipment.findById(eq1._id).lean();
      check(
        "webhook replay does not decrement stock twice",
        afterReplay?.availableQuantity === 3,
        afterReplay?.availableQuantity
      );

      const otherEvent = JSON.stringify({
        id: "evt_test_local_2",
        object: "event",
        type: "customer.created",
        data: { object: { id: "cus_test" } },
      });
      const otherSignature = stripe.webhooks.generateTestHeaderString({
        payload: otherEvent,
        secret: process.env.STRIPE_WEBHOOK_SECRET,
      });
      const ignored = await client("POST", "/api/payments/webhook", {
        body: otherEvent,
        contentType: "application/json",
        headers: { "stripe-signature": otherSignature },
      });
      check("unrelated Stripe events are acknowledged", ignored.status === 200);

      // Cancel the paid booking: stock must be restored once and the refund
      // attempt (against the fake intent) must not crash the endpoint.
      const cancelPaid = await client("PATCH", `/api/bookings/${booking2._id}/status`, {
        token: tokens.owner1,
        json: { bookingStatus: "cancelled", cancellationReason: "Integration test" },
      });
      check("paid booking can be cancelled", cancelPaid.status === 200, cancelPaid.body);
      check(
        "refund failure is reported without failing the request",
        cancelPaid.body?.refund && cancelPaid.body.refund.refunded === false,
        cancelPaid.body?.refund
      );

      const afterCancel = await Equipment.findById(eq1._id).lean();
      check(
        "cancelling paid booking restores stock",
        afterCancel?.availableQuantity === 5,
        afterCancel?.availableQuantity
      );

      const cancelAgain = await client("PATCH", `/api/bookings/${booking2._id}/status`, {
        token: tokens.owner1,
        json: { bookingStatus: "cancelled" },
      });
      check("repeated cancellation is idempotent", cancelAgain.status === 200);

      const afterSecondCancel = await Equipment.findById(eq1._id).lean();
      check(
        "repeated cancellation does not restore stock twice",
        afterSecondCancel?.availableQuantity === 5,
        afterSecondCancel?.availableQuantity
      );
    }

    // -------------------------------------------------------------------
    // Analytics
    // -------------------------------------------------------------------
    console.log("\n▶ Analytics");
    {
      const forbidden = await client("GET", "/api/analytics/admin", {
        token: tokens.customer1,
      });
      check("customer cannot read admin analytics", forbidden.status === 403);

      const admin = await client("GET", "/api/analytics/admin", { token: tokens.admin1 });
      check("admin analytics returns 200", admin.status === 200, admin.body);
      check("analytics totals are numbers", typeof admin.body?.totals?.totalUsers === "number");
      check(
        "revenue only counts successful payments",
        admin.body?.totals?.totalRevenue === 400,
        admin.body?.totals?.totalRevenue
      );
      check("monthly series is an array", Array.isArray(admin.body?.monthlyBookings));
      check(
        "monthly revenue matches payments",
        admin.body?.monthlyBookings?.some((month) => month.revenue === 400)
      );

      const ownerForbidden = await client("GET", "/api/analytics/owner", {
        token: tokens.customer1,
      });
      check("customer cannot read owner analytics", ownerForbidden.status === 403);

      const owner = await client("GET", "/api/analytics/owner", { token: tokens.owner1 });
      check("owner analytics returns 200", owner.status === 200, owner.body);
      check(
        "owner earnings only count successful payments",
        owner.body?.totals?.totalEarnings === 400,
        owner.body?.totals?.totalEarnings
      );
    }

    // -------------------------------------------------------------------
    // Deletion guard + cascade
    // -------------------------------------------------------------------
    console.log("\n▶ Deletion");
    {
      const blocked = await client("DELETE", `/api/equipment/${eqDelete._id}`, {
        token: tokens.owner1,
      });
      check("equipment with active booking cannot be deleted", blocked.status === 409, blocked.body);

      const cancelBooking = await client("PATCH", `/api/bookings/${booking3._id}/status`, {
        token: tokens.owner1,
        json: { bookingStatus: "cancelled" },
      });
      check("booking can be cancelled before equipment deletion", cancelBooking.status === 200);

      const deleted = await client("DELETE", `/api/equipment/${eqDelete._id}`, {
        token: tokens.owner1,
      });
      check("equipment can be deleted once rentals are settled", deleted.status === 200, deleted.body);
      check("equipment is gone", (await Equipment.findById(eqDelete._id)) === null);
    }

    // -------------------------------------------------------------------
    // Database invariants
    // -------------------------------------------------------------------
    console.log("\n▶ Database");
    {
      check(
        "favorite unique index exists",
        Boolean((await Favorite.collection.indexes()).find((index) => index.unique))
      );
      check(
        "booking snapshot fields are populated",
        Boolean((await Booking.findById(booking1._id).lean())?.equipmentName)
      );
    }
  } catch (error) {
    console.error("\n💥 Test suite crashed:", error);
    exitCode = 1;
  } finally {
    const ok = reporter.summary("API integration tests");
    if (!ok) exitCode = 1;

    try {
      await cleanDatabase(mongoose.connection);
      console.log(`🧹 Cleaned test database ${testInfo.dbName}`);
    } catch (error) {
      console.error("⚠️ Could not clean test database:", error.message);
      exitCode = 1;
    }

    await disconnectDB().catch(() => {});
    await server.close();
    await jwks.close();
  }

  process.exit(exitCode);
};

run().catch((error) => {
  console.error("💥 Fatal test error:", error);
  process.exit(1);
});
