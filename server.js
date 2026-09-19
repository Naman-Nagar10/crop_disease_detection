require("dotenv").config();

const fs = require("fs");
const crypto = require("crypto");
const https = require("https");

const path = require("path");
const express = require("express");
const multer = require("multer");
const nodemailer = require("nodemailer");
const { GoogleGenAI } = require("@google/genai");
const { initializeDatabase, db, hashPassword } = require("./database");

const app = express();
const port = process.env.PORT || 8080;
const upload = multer({ dest: path.join(__dirname, "uploads") });

const COOKIE_NAME = "krishi_session";
const SESSION_AGE_SECONDS = 60 * 60 * 24;

// ---------- Small helper functions ----------

function verifyPassword(enteredPassword, savedPassword) {
    const [salt, savedHash] = savedPassword.split(":");
    const enteredHash = crypto.scryptSync(enteredPassword, salt, 64).toString("hex");

    return crypto.timingSafeEqual(
        Buffer.from(savedHash, "hex"),
        Buffer.from(enteredHash, "hex")
    );
}

function getCookies(request) {
    const cookieText = request.headers.cookie || "";
    const cookies = {};

    cookieText.split(";").filter(Boolean).forEach((cookie) => {
        const equalSign = cookie.indexOf("=");
        const name = cookie.slice(0, equalSign).trim();
        const value = decodeURIComponent(cookie.slice(equalSign + 1));
        cookies[name] = value;
    });

    return cookies;
}

async function startSession(response, user) {
    const token = crypto.randomBytes(32).toString("hex");
    await db().query(
        "INSERT INTO user_sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
        [token, user.id, new Date(Date.now() + SESSION_AGE_SECONDS * 1000)]
    );

    response.setHeader(
        "Set-Cookie",
        `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_AGE_SECONDS}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`
    );
}

function requireLogin(request, response, next) {
    if (request.user) return next();
    return response.redirect("/login");
}

function requireVerified(request, response, next) {
    if (request.user?.email_verified) return next();
    return response.redirect("/verify-email?email=" + encodeURIComponent(request.user?.email || ""));
}

function requireVerifiedApi(request, response, next) {
    if (!request.user) {
        return response.status(401).json({ success: false, message: "Login required" });
    }
    if (!request.user.email_verified) {
        return response.status(403).json({ success: false, message: "Please verify your email first" });
    }
    next();
}

function requireAdmin(request, response, next) {
    if (request.user?.role === "admin") return next();

    return response.status(403).render("message", {
        title: "Access denied",
        message: "यह पेज केवल administrator के लिए है।"
    });
}

// ---------- App settings and middleware ----------

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Read the login cookie and make the logged-in user available in every EJS page.
app.use(async (request, response, next) => {
    try {
        const cookies = getCookies(request);
        const sessionId = cookies[COOKIE_NAME];

        if (sessionId) {
            const [users] = await db().query(
                `SELECT u.id, u.name, u.email, u.role, u.email_verified
                 FROM user_sessions s JOIN users u ON u.id = s.user_id
                 WHERE s.id = ? AND s.expires_at > NOW()`,
                [sessionId]
            );
            request.user = users[0];
        }

        response.locals.user = request.user || null;
        next();
    } catch (error) {
        next(error);
    }
});

// ---------- Public pages ----------

app.get("/", (request, response) => {
    response.render("index");
});

app.get("/login", (request, response) => {
    response.render("auth", { mode: "login", error: null });
});

app.get("/signup", (request, response) => {
    response.render("auth", { mode: "signup", error: null });
});

function makeOtp() {
    return String(crypto.randomInt(100000, 1000000));
}

async function sendVerificationOtp(user) {
    if (!process.env.BREVO_SMTP_LOGIN || !process.env.BREVO_SMTP_KEY || !process.env.EMAIL_FROM) {
        throw new Error("Brevo SMTP is not configured.");
    }
    const otp = makeOtp();
    await db().query("UPDATE email_verifications SET consumed_at = NOW() WHERE user_id = ? AND consumed_at IS NULL", [user.id]);
    await db().query(
        "INSERT INTO email_verifications (id, user_id, code_hash, expires_at) VALUES (?, ?, SHA2(?, 256), DATE_ADD(NOW(), INTERVAL 10 MINUTE))",
        [crypto.randomUUID(), user.id, otp]
    );
    const transporter = nodemailer.createTransport({
        host: "smtp-relay.brevo.com", port: 2525, secure: false,
        auth: { user: process.env.BREVO_SMTP_LOGIN, pass: process.env.BREVO_SMTP_KEY }
    });
    await transporter.sendMail({
        from: process.env.EMAIL_FROM, to: user.email,
        subject: "Krishi Rakshak verification code",
        text: `Namaste ${user.name}, आपका Krishi Rakshak OTP है: ${otp}. यह 10 मिनट तक valid है।`
    });
}

app.get("/verify-email", (request, response) => {
    response.render("verify-email", { email: request.query.email || "", error: null, success: null });
});

app.post("/verify-email", async (request, response, next) => {
    try {
        const email = request.body.email?.trim().toLowerCase();
        const otp = request.body.otp?.trim();
        const [[user]] = await db().query("SELECT id, name, email, role FROM users WHERE email = ?", [email]);
        if (!user) return response.status(400).render("verify-email", { email, error: "Account नहीं मिला।", success: null });
        const [[verification]] = await db().query(
            "SELECT id FROM email_verifications WHERE user_id=? AND code_hash=SHA2(?, 256) AND consumed_at IS NULL AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1",
            [user.id, otp]
        );
        if (!verification) return response.status(400).render("verify-email", { email, error: "OTP गलत है या expire हो गया है।", success: null });
        await db().query("UPDATE email_verifications SET consumed_at=NOW() WHERE id=?", [verification.id]);
        await db().query("UPDATE users SET email_verified=TRUE, verification_status='verified' WHERE id=?", [user.id]);
        await startSession(response, user);
        response.redirect(user.role === "admin" ? "/admin" : "/");
    } catch (error) { next(error); }
});

app.post("/verify-email/resend", async (request, response, next) => {
    try {
        const email = request.body.email?.trim().toLowerCase();
        const [[user]] = await db().query("SELECT id, name, email FROM users WHERE email=? AND email_verified=FALSE", [email]);
        if (!user) return response.status(400).render("verify-email", { email, error: "Unverified account नहीं मिला।", success: null });
        await sendVerificationOtp(user);
        response.render("verify-email", { email, error: null, success: "नया OTP आपके email पर भेज दिया गया है।" });
    } catch (error) { next(error); }
});

app.get("/auth/google", (request, response) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.APP_URL) {
        return response.status(503).render("message", { title: "Google login unavailable", message: "Google OAuth settings अभी configured नहीं हैं।" });
    }
    const state = crypto.randomBytes(24).toString("hex");
    response.setHeader("Set-Cookie", `google_oauth_state=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
    const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        redirect_uri: `${process.env.APP_URL}/auth/google/callback`,
        response_type: "code",
        scope: "openid email profile",
        state,
        prompt: "select_account"
    });
    response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

app.get("/auth/google/callback", async (request, response, next) => {
    try {
        const cookies = getCookies(request);
        if (!request.query.code || !request.query.state || request.query.state !== cookies.google_oauth_state) {
            return response.status(400).render("message", { title: "Google login failed", message: "Login request सत्यापित नहीं हो सका।" });
        }
        const redirectUri = `${process.env.APP_URL}/auth/google/callback`;
        const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ code: request.query.code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri, grant_type: "authorization_code" })
        });
        const token = await tokenResponse.json();
        if (!tokenResponse.ok) throw new Error("Google token exchange failed");
        const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${token.access_token}` } });
        const profile = await profileResponse.json();
        if (!profileResponse.ok || !profile.email_verified || !profile.email || !profile.sub) throw new Error("Google account email is not verified");
        const email = profile.email.trim().toLowerCase();
        const [[existingUser]] = await db().query("SELECT id, name, email, role, email_verified FROM users WHERE email = ? OR google_id = ? LIMIT 1", [email, profile.sub]);
        let user = existingUser;
        if (user) {
            await db().query("UPDATE users SET google_id=?, email_verified=TRUE, verification_status='verified', profile_picture=? WHERE id=?", [profile.sub, profile.picture || null, user.id]);
            user.email_verified = 1;
        } else {
            user = { id: crypto.randomUUID(), name: profile.name || email.split("@")[0], email, role: "farmer", email_verified: 1 };
            await db().query("INSERT INTO users (id, name, email, password_hash, role, email_verified, verification_status, google_id, profile_picture) VALUES (?, ?, ?, ?, ?, TRUE, 'verified', ?, ?)", [user.id, user.name, user.email, hashPassword(crypto.randomBytes(32).toString("hex")), user.role, profile.sub, profile.picture || null]);
        }
        response.setHeader("Set-Cookie", "google_oauth_state=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
        await startSession(response, user);
        response.redirect(user.role === "admin" ? "/admin" : "/");
    } catch (error) { next(error); }
});

// ---------- Login and signup ----------

app.post("/signup", async (request, response, next) => {
    try {
        const name = request.body.name?.trim();
        const email = request.body.email?.trim().toLowerCase();
        const password = request.body.password || "";
        const isValidEmail = /^\S+@\S+\.\S+$/.test(email || "");

        if (!name || !isValidEmail || password.length < 6) {
            return response.status(400).render("auth", {
                mode: "signup",
                error: "नाम, सही email और कम-से-कम 6 अक्षर का password डालें।"
            });
        }

        // This prevents an unverified address from ever becoming an active account.
        if (!process.env.BREVO_SMTP_LOGIN || !process.env.BREVO_SMTP_KEY || !process.env.EMAIL_FROM) {
            return response.status(503).render("auth", { mode: "signup", error: "Email verification service अभी configured नहीं है। Google से continue करें या administrator से संपर्क करें।" });
        }

        const [existingUsers] = await db().query(
            "SELECT id FROM users WHERE email = ?",
            [email]
        );

        if (existingUsers.length) {
            return response.status(400).render("auth", {
                mode: "signup",
                error: "इस email से account पहले से मौजूद है।"
            });
        }

        const user = {
            id: crypto.randomUUID(),
            name,
            email,
            role: "farmer"
        };

        await db().query(
            "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)",
            [user.id, user.name, user.email, hashPassword(password), user.role]
        );

        await sendVerificationOtp(user);
        response.redirect("/verify-email?email=" + encodeURIComponent(user.email));
    } catch (error) {
        next(error);
    }
});

app.post("/login", async (request, response, next) => {
    try {
        const email = request.body.email?.trim().toLowerCase();
        const password = request.body.password || "";

        const [users] = await db().query(
            "SELECT id, name, email, password_hash, role, email_verified FROM users WHERE email = ?",
            [email]
        );
        const user = users[0];

        if (!user || !verifyPassword(password, user.password_hash)) {
            return response.status(401).render("auth", {
                mode: "login",
                error: "Email या password सही नहीं है।"
            });
        }

        if (!user.email_verified) {
            return response.redirect("/verify-email?email=" + encodeURIComponent(user.email));
        }

        await startSession(response, user);
        response.redirect(user.role === "admin" ? "/admin" : "/");
    } catch (error) {
        next(error);
    }
});

app.post("/logout", async (request, response, next) => {
    const cookies = getCookies(request);
    try {
        await db().query("DELETE FROM user_sessions WHERE id = ?", [cookies[COOKIE_NAME]]);
    } catch (error) { return next(error); }

    response.setHeader(
        "Set-Cookie",
        `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
    );
    response.redirect("/");
});

// ---------- Government schemes ----------

app.get("/schemes", requireLogin, async (request, response, next) => {
    try {
        const [schemes] = await db().query(
            "SELECT * FROM schemes ORDER BY created_at DESC"
        );
        response.render("schemes", { schemes });
    } catch (error) {
        next(error);
    }
});

// ---------- Admin panel ----------

async function showAdminPage(request, response, next, editingScheme = null) {
    try {
        const [schemes] = await db().query(
            "SELECT * FROM schemes ORDER BY created_at DESC"
        );
        const [[count]] = await db().query("SELECT COUNT(*) AS userCount FROM users");

        response.render("admin", {
            schemes,
            userCount: count.userCount,
            editing: editingScheme
        });
    } catch (error) {
        next(error);
    }
}

app.get("/admin", requireLogin, requireAdmin, (request, response, next) => {
    showAdminPage(request, response, next);
});

app.post("/admin/schemes", requireLogin, requireAdmin, async (request, response, next) => {
    try {
        const { title, state, benefit, description, link } = request.body;

        if (!title?.trim() || !description?.trim()) {
            return response.redirect("/admin");
        }

        await db().query(
            "INSERT INTO schemes (id, title, state, benefit, description, link) VALUES (?, ?, ?, ?, ?, ?)",
            [
                crypto.randomUUID(),
                title.trim(),
                state?.trim() || "All India",
                benefit?.trim() || "Details देखें",
                description.trim(),
                link?.trim() || "#"
            ]
        );

        response.redirect("/admin");
    } catch (error) {
        next(error);
    }
});

app.get("/admin/schemes/:id/edit", requireLogin, requireAdmin, async (request, response, next) => {
    try {
        const [schemes] = await db().query(
            "SELECT * FROM schemes WHERE id = ?",
            [request.params.id]
        );

        showAdminPage(request, response, next, schemes[0] || null);
    } catch (error) {
        next(error);
    }
});

app.post("/admin/schemes/:id", requireLogin, requireAdmin, async (request, response, next) => {
    try {
        const { title, state, benefit, description, link } = request.body;

        await db().query(
            "UPDATE schemes SET title = ?, state = ?, benefit = ?, description = ?, link = ? WHERE id = ?",
            [
                title.trim(),
                state.trim() || "All India",
                benefit.trim() || "Details देखें",
                description.trim(),
                link.trim() || "#",
                request.params.id
            ]
        );

        response.redirect("/admin");
    } catch (error) {
        next(error);
    }
});

app.post("/admin/schemes/:id/delete", requireLogin, requireAdmin, async (request, response, next) => {
    try {
        await db().query("DELETE FROM schemes WHERE id = ?", [request.params.id]);
        response.redirect("/admin");
    } catch (error) {
        next(error);
    }
});

// ---------- Kisan Community ----------

app.get("/community", requireLogin, requireVerified, async (request, response, next) => {
    try {
        const [questions] = await db().query(`
            SELECT q.*, u.name AS asker_name, COUNT(a.id) AS answer_count
            FROM community_questions q
            JOIN users u ON u.id = q.user_id
            LEFT JOIN community_answers a ON a.question_id = q.id AND a.status = 'approved'
            WHERE q.status = 'active'
            GROUP BY q.id
            ORDER BY q.created_at DESC
        `);
        const [answeredQuestions] = await db().query(`
            SELECT q.*, u.name AS asker_name, a.answer, a.created_at AS answer_created_at,
                   answerer.name AS answerer_name
            FROM community_questions q
            JOIN users u ON u.id = q.user_id
            JOIN community_answers a ON a.question_id = q.id AND a.status = 'approved'
            JOIN users answerer ON answerer.id = a.user_id
            WHERE q.status = 'active'
            ORDER BY a.created_at DESC
        `);
        response.render("community", { questions, answeredQuestions });
    } catch (error) { next(error); }
});

app.post("/community/questions", requireLogin, requireVerified, async (request, response, next) => {
    try {
        const question = request.body.question?.trim();
        const category = request.body.category?.trim() || null;
        if (!question || question.length > 2000) return response.redirect("/community");
        await db().query(
            "INSERT INTO community_questions (id, user_id, question, category, status) VALUES (?, ?, ?, ?, 'active')",
            [crypto.randomUUID(), request.user.id, question, category]
        );
        response.redirect("/community");
    } catch (error) { next(error); }
});

app.get("/community/questions/:id", requireLogin, requireVerified, async (request, response, next) => {
    try {
        const [[question]] = await db().query(`
            SELECT q.*, u.name AS asker_name FROM community_questions q
            JOIN users u ON u.id = q.user_id WHERE q.id = ? AND q.status = 'active'`,
            [request.params.id]
        );
        if (!question) return response.status(404).render("message", { title: "Question not found", message: "यह प्रश्न उपलब्ध नहीं है।" });
        const [answers] = await db().query(`
            SELECT a.*, u.name AS answerer_name FROM community_answers a
            JOIN users u ON u.id = a.user_id WHERE a.question_id = ? AND a.status = 'approved'
            ORDER BY a.created_at ASC`, [question.id]);
        response.render("community-question", { question, answers });
    } catch (error) { next(error); }
});

app.post("/community/questions/:id/answers", requireLogin, requireVerified, async (request, response, next) => {
    try {
        const answer = request.body.answer?.trim();
        if (!answer || answer.length > 4000) return response.redirect(`/community/questions/${request.params.id}`);
        const [[question]] = await db().query("SELECT id FROM community_questions WHERE id = ? AND status = 'active'", [request.params.id]);
        if (!question) return response.status(404).render("message", { title: "Question not found", message: "यह प्रश्न उपलब्ध नहीं है।" });
        await db().query(
            "INSERT INTO community_answers (id, question_id, user_id, answer, status) VALUES (?, ?, ?, ?, 'pending')",
            [crypto.randomUUID(), question.id, request.user.id, answer]
        );
        response.redirect(`/community/questions/${question.id}`);
    } catch (error) { next(error); }
});

app.get("/admin/community", requireLogin, requireAdmin, async (request, response, next) => {
    try {
        const [pendingQuestions] = await db().query(`SELECT q.*, u.name AS author_name FROM community_questions q JOIN users u ON u.id=q.user_id WHERE q.status='pending' ORDER BY q.created_at ASC`);
        const [pendingAnswers] = await db().query(`SELECT a.*, q.question, u.name AS author_name FROM community_answers a JOIN community_questions q ON q.id=a.question_id JOIN users u ON u.id=a.user_id WHERE a.status='pending' ORDER BY a.created_at ASC`);
        const [approvedAnswers] = await db().query(`SELECT a.*, q.question, u.name AS author_name FROM community_answers a JOIN community_questions q ON q.id=a.question_id JOIN users u ON u.id=a.user_id WHERE a.status='approved' ORDER BY a.approved_at DESC`);
        response.render("community-moderation", { pendingQuestions, pendingAnswers, approvedAnswers });
    } catch (error) { next(error); }
});

app.post("/admin/community/answers/:id/:action", requireLogin, requireAdmin, async (request, response, next) => {
    try {
        const status = request.params.action === "approve" ? "approved" : "rejected";
        await db().query("UPDATE community_answers SET status=?, approved_at=IF(?='approved', NOW(), NULL), approved_by=IF(?='approved', ?, NULL) WHERE id=?", [status, status, status, request.user.id, request.params.id]);
        response.redirect("/admin/community");
    } catch (error) { next(error); }
});

app.post("/admin/community/questions/:id/:action", requireLogin, requireAdmin, async (request, response, next) => {
    try {
        const status = request.params.action === "approve" ? "active" : "rejected";
        await db().query("UPDATE community_questions SET status=?, moderated_at=NOW(), moderated_by=? WHERE id=?", [status, request.user.id, request.params.id]);
        response.redirect("/admin/community");
    } catch (error) { next(error); }
});

// ---------- Mandi price API ----------
// Everything comes from data.gov.in. No hard-coded State/District/Crop lists.

function fetchMandiData(params = {}) {
    return new Promise((resolve, reject) => {
        if (!process.env.MANDI_API_KEY || !process.env.MANDI_RESOURCE_ID) {
            return reject(new Error("MANDI_API_KEY or MANDI_RESOURCE_ID is missing"));
        }

        const mandiUrl = new URL(
            `https://api.data.gov.in/resource/${process.env.MANDI_RESOURCE_ID}`
        );

        mandiUrl.searchParams.set("api-key", process.env.MANDI_API_KEY);
        mandiUrl.searchParams.set("format", "json");

        // Keep each request reasonably small.
        mandiUrl.searchParams.set("limit", params.limit || "1000");

        if (params.offset) {
            mandiUrl.searchParams.set("offset", params.offset);
        }

        if (params.state) {
            mandiUrl.searchParams.set("filters[state]", params.state);
        }

        if (params.district) {
            mandiUrl.searchParams.set("filters[district]", params.district);
        }

        if (params.commodity) {
            mandiUrl.searchParams.set("filters[commodity]", params.commodity);
        }

        const request = https.get(
            mandiUrl,
            {
                family: 4,
                timeout: 15000,
                headers: {
                    Accept: "application/json",
                    "User-Agent": "Krishi-Rakshak/1.0"
                }
            },
            (apiResponse) => {
                let body = "";

                apiResponse.setEncoding("utf8");

                apiResponse.on("data", (chunk) => {
                    body += chunk;
                });

                apiResponse.on("end", () => {
                    let data;

                    try {
                        data = JSON.parse(body);
                    } catch {
                        return reject(
                            new Error(
                                `Mandi API returned invalid JSON (HTTP ${apiResponse.statusCode})`
                            )
                        );
                    }

                    if (apiResponse.statusCode < 200 || apiResponse.statusCode >= 300) {
                        const message =
                            data?.error ||
                            data?.message ||
                            `Mandi API returned HTTP ${apiResponse.statusCode}`;

                        const error = new Error(message);
                        error.statusCode = apiResponse.statusCode;
                        error.apiData = data;
                        return reject(error);
                    }

                    resolve(data);
                });
            }
        );

        request.on("timeout", () => {
            request.destroy(new Error("Mandi API connection timed out"));
        });

        request.on("error", reject);
    });
}

// Cache dropdown data for 30 minutes.
// This avoids repeatedly downloading the same data from data.gov.in.
const mandiOptionsCache = {
    states: { expires: 0, values: [] },
    districts: new Map(),
    crops: new Map()
};

function uniqueSorted(values) {
    return [...new Set(
        values
            .map((value) => String(value || "").trim())
            .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b));
}

async function getAllMandiRecords(filters = {}) {
    const allRecords = [];
    const pageSize = 1000;
    let offset = 0;
    const maxPages = 100; // safety limit: maximum 100,000 records

    for (let page = 0; page < maxPages; page += 1) {
        const data = await fetchMandiData({
            ...filters,
            limit: pageSize,
            offset
        });

        const records = Array.isArray(data?.records) ? data.records : [];
        allRecords.push(...records);

        if (records.length < pageSize) break;

        offset += pageSize;
    }

    return allRecords;
}

app.get("/api/mandi-prices", requireVerifiedApi, async (request, response) => {
    try {
        const { type, state, district, commodity } = request.query;

        // 1. State dropdown: States are read from the API dataset.
        if (type === "states") {
            if (
                mandiOptionsCache.states.expires > Date.now() &&
                mandiOptionsCache.states.values.length
            ) {
                return response.json({
                    success: true,
                    type: "states",
                    values: mandiOptionsCache.states.values
                });
            }

            const records = await getAllMandiRecords();

            const states = uniqueSorted(
                records.map((row) => row.state)
            );

            if (!states.length) {
                return response.status(404).json({
                    success: false,
                    message: "API से कोई State नहीं मिली।"
                });
            }

            mandiOptionsCache.states = {
                expires: Date.now() + 30 * 60 * 1000,
                values: states
            };

            return response.json({
                success: true,
                type: "states",
                values: states
            });
        }

        // State is required for all other option/price requests.
        if (!state) {
            return response.status(400).json({
                success: false,
                message: "State required है।"
            });
        }

        // 2. District dropdown: only districts belonging to selected State.
        if (type === "districts") {
            const cacheKey = state;
            const cached = mandiOptionsCache.districts.get(cacheKey);

            if (cached && cached.expires > Date.now()) {
                return response.json({
                    success: true,
                    type: "districts",
                    values: cached.values
                });
            }

            const records = await getAllMandiRecords({ state });

            const districts = uniqueSorted(
                records.map((row) => row.district)
            );

            if (!districts.length) {
                return response.status(404).json({
                    success: false,
                    message: "इस State के लिए API से कोई District नहीं मिली।"
                });
            }

            mandiOptionsCache.districts.set(cacheKey, {
                expires: Date.now() + 30 * 60 * 1000,
                values: districts
            });

            return response.json({
                success: true,
                type: "districts",
                values: districts
            });
        }

        if (!district) {
            return response.status(400).json({
                success: false,
                message: "District required है।"
            });
        }

        // 3. Crop dropdown: only crops available in selected State + District.
        if (type === "crops") {
            const cacheKey = `${state}|||${district}`;
            const cached = mandiOptionsCache.crops.get(cacheKey);

            if (cached && cached.expires > Date.now()) {
                return response.json({
                    success: true,
                    type: "crops",
                    values: cached.values
                });
            }

            const records = await getAllMandiRecords({
                state,
                district
            });

            const crops = uniqueSorted(
                records.map((row) => row.commodity)
            );

            if (!crops.length) {
                return response.status(404).json({
                    success: false,
                    message: "इस District के लिए API से कोई Crop नहीं मिली।"
                });
            }

            mandiOptionsCache.crops.set(cacheKey, {
                expires: Date.now() + 30 * 60 * 1000,
                values: crops
            });

            return response.json({
                success: true,
                type: "crops",
                values: crops
            });
        }

        // 4. Final price request.
        if (!commodity) {
            return response.status(400).json({
                success: false,
                message: "Crop required है।"
            });
        }

        const data = await fetchMandiData({
            state,
            district,
            commodity,
            limit: 1000
        });

        return response.json({
            success: true,
            records: Array.isArray(data?.records) ? data.records : []
        });

    } catch (error) {
        console.error("Mandi API error:", error.message);
        if (error.apiData) {
            console.error("Mandi API response:", error.apiData);
        }

        return response.status(error.statusCode || 502).json({
            success: false,
            message: error.message || "Mandi API से data नहीं मिल सका।"
        });
    }
});



// ---------- AI chat ----------

app.post("/api/chat", requireVerifiedApi, async (request, response) => {

    if (!process.env.GEMINI_API_KEY) {

        return response.status(500).send(
            "Gemini API key नहीं मिली।"
        );
    }

    try {

        const ai = new GoogleGenAI({
            apiKey: process.env.GEMINI_API_KEY
        });


        const prompt = `
You are Krishi Rakshak, an Indian agriculture assistant.

The farmer is asking about agriculture or crop disease.

Give practical, concise and easy-to-understand Hindi/Hinglish advice.

If a disease has already been detected, focus mainly on saving the crop.

Use this structure:

 बीमारी:

Briefly explain the disease and its effect on the crop.

 अभी क्या करें:

Give immediate practical steps.

 Chemical Control:

Mention suitable chemical-control options only when genuinely applicable.

Prefer active ingredient names.

Do not invent pesticide names, doses, concentrations or application intervals.

Tell the farmer to follow the product label and locally approved agricultural recommendations.

 रोकथाम:

Explain how to prevent further spread.

 सावधानी:

Give important crop and pesticide safety precautions.

Keep answers short.

Do not write one large paragraph.

Farmer question:

${request.body.question}
`;


        // ================= GEMINI STREAM =================

        const stream =
            await ai.models.generateContentStream({

                model: "gemini-3.6-flash",

                contents: prompt

            });


        // ================= STREAM HEADERS =================

        response.setHeader(
            "Content-Type",
            "text/plain; charset=utf-8"
        );

        response.setHeader(
            "Cache-Control",
            "no-cache, no-transform"
        );

        response.setHeader(
            "Connection",
            "keep-alive"
        );

        response.setHeader(
            "X-Accel-Buffering",
            "no"
        );


        // ================= SEND CHUNKS =================

        for await (const chunk of stream) {

            const text = chunk.text || "";

            if (text) {

                response.write(text);

            }

        }


        response.end();


    } catch (error) {

        console.error(
            "AI chat error:",
            error
        );


        if (!response.headersSent) {

            response.status(502).send(
                "AI service अभी उपलब्ध नहीं है।"
            );

        } else {

            response.end();

        }

    }

});

// ---------- Crop Disease Scan ----------

app.post(
    "/api/scan",
    requireVerifiedApi,
    upload.single("image"),
    async (request, response) => {

        try {

            if (!request.file) {

                return response.status(400).json({
                    success: false,
                    message: "Image नहीं मिली"
                });

            }


            const crop =
                request.body.crop;


            if (!crop) {

                return response.status(400).json({
                    success: false,
                    message: "Crop select नहीं की गई"
                });

            }


            console.log(
                "Crop:",
                crop
            );

            console.log(
                "Image received:",
                request.file.originalname
            );


            //    RICE - DUMMY
  

            if (crop === "Rice") {

                return response.json({

                    success: true,

                    crop: "Rice",

                    disease: "Healthy",

                    confidence: 95,

                    status: "healthy"

                });

            }


            /* WHEAT - DUMMY*/

            if (crop === "Wheat") {

                return response.json({

                    success: true,

                    crop: "Wheat",

                    disease: "Leaf Rust",

                    confidence: 91,

                    status: "disease"

                });

            }


            /* SUGARCANE - REAL ROBOFLOW */

            if (crop === "Sugarcane") {


                // Image → Base64

                const imageBuffer =
                    fs.readFileSync(
                        request.file.path
                    );


                const base64Image =
                    imageBuffer.toString(
                        "base64"
                    );


                // Roboflow Workflow

                const roboflowResponse =
                    await fetch(

                        "https://serverless.roboflow.com/naman-nagar/workflows/cropdiseasedetection-vcropdiseasedetection-yj2yz-1-resnet50-t1-logic",

                        {

                            method: "POST",

                            headers: {

                                "Content-Type":
                                    "application/json",

                                "Authorization":
                                    `Bearer ${process.env.ROBOFLOW_API_KEY}`

                            },

                            body: JSON.stringify({

                                inputs: {

                                    image: {

                                        type: "base64",

                                        value:
                                            base64Image

                                    }

                                }

                            })

                        }

                    );


                const result =
                    await roboflowResponse.json();


                console.dir(
                    result,
                    { depth: null }
                );


                /* Roboflow error */

                if (!roboflowResponse.ok) {

                    console.error(
                        "Roboflow API error:",
                        result
                    );


                    return response.status(502).json({

                        success: false,

                        message:
                            "Disease detection service unavailable"

                    });

                }


                /* Prediction */

                const prediction =
                    result
                        ?.outputs?.[0]
                        ?.predictions;


                if (!prediction) {

                    return response.status(500).json({

                        success: false,

                        message:
                            "Prediction नहीं मिली"

                    });

                }


                const disease =
                    prediction.top;


                const confidence =
                    Math.round(
                        prediction.confidence * 100
                    );


                const isHealthy =
                    disease.toLowerCase() ===
                    "healthy";


                return response.json({

                    success: true,

                    crop: "Sugarcane",

                    disease: disease,

                    confidence: confidence,

                    status:
                        isHealthy
                            ? "healthy"
                            : "disease"

                });

            }


            /* Unknown crop */

            return response.status(400).json({

                success: false,

                message: "Invalid crop selected"

            });


        } catch (error) {

            console.error(
                "Roboflow error:",
                error
            );


            return response.status(500).json({

                success: false,

                message:
                    "Disease detection failed"

            });

        }

    }
);



// ---------- Mandi price API ----------

app.get("/api/mandi-prices", async (request, response) => {
    try {
        const { state, district, commodity } = request.query;

        if (!process.env.MANDI_API_KEY || !process.env.MANDI_RESOURCE_ID) {
            return response.status(500).json({
                success: false,
                message: "Mandi API .env में configured नहीं है।"
            });
        }

        const mandiUrl = new URL(
            `https://api.data.gov.in/resource/${process.env.MANDI_RESOURCE_ID}`
        );

        mandiUrl.searchParams.set("api-key", process.env.MANDI_API_KEY);
        mandiUrl.searchParams.set("format", "json");
        mandiUrl.searchParams.set("limit", "1000");

        if (state) {
            mandiUrl.searchParams.set("filters[state]", state);
        }

        if (district) {
            mandiUrl.searchParams.set("filters[district]", district);
        }

        if (commodity) {
            mandiUrl.searchParams.set("filters[commodity]", commodity);
        }

        const mandiApiResponse = await fetch(mandiUrl);

        const responseText = await mandiApiResponse.text();

        let mandiData;

        try {
            mandiData = JSON.parse(responseText);
        } catch {
            console.error(
                "data.gov.in ने JSON की जगह यह response दिया:",
                responseText.slice(0, 500)
            );

            return response.status(502).json({
                success: false,
                message: "data.gov.in से सही JSON response नहीं मिला।"
            });
        }

        return response.status(mandiApiResponse.status).json(mandiData);

    } catch (error) {
        console.error("Mandi API error:", error.message);
        console.error("Mandi API cause:", error.cause || "");

        return response.status(500).json({
            success: false,
            message: "Mandi API से connection नहीं हो सका।"
        });
    }
});

// ---------- Error handling and startup ----------

app.use((request, response) => {
    response.status(404).render("message", {
        title: "Page not found",
        message: "यह पेज उपलब्ध नहीं है।"
    });
});

app.use((error, request, response, next) => {
    console.error(error);
    response.status(500).render("message", {
        title: "Database connection issue",
        message: "MySQL settings check करें और server restart करें।"
    });
});

initializeDatabase()
    .then(() => {
        app.listen(port, () => {
            console.log(`Krishi Rakshak listening on ${port}`);
        });
    })
    .catch((error) => {
        console.error("MySQL startup failed:", error.message);
        process.exit(1);
    });
