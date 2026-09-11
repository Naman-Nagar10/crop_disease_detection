require("dotenv").config();

const crypto = require("crypto");
const path = require("path");
const express = require("express");
const multer = require("multer");
const { GoogleGenAI } = require("@google/genai");
const { initializeDatabase, db, hashPassword } = require("./database");

const app = express();
const port = process.env.PORT || 8080;
const upload = multer({ dest: path.join(__dirname, "uploads") });

// Sessions are temporary: users log in again after the server restarts.
const sessions = new Map();

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

function startSession(response, user) {
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, { userId: user.id });

    response.setHeader(
        "Set-Cookie",
        `krishi_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`
    );
}

function requireLogin(request, response, next) {
    if (request.user) return next();
    return response.redirect("/login");
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
        const session = sessions.get(cookies.krishi_session);

        if (session) {
            const [users] = await db().query(
                "SELECT id, name, email, role FROM users WHERE id = ?",
                [session.userId]
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

        startSession(response, user);
        response.redirect("/");
    } catch (error) {
        next(error);
    }
});

app.post("/login", async (request, response, next) => {
    try {
        const email = request.body.email?.trim().toLowerCase();
        const password = request.body.password || "";

        const [users] = await db().query(
            "SELECT id, name, email, password_hash, role FROM users WHERE email = ?",
            [email]
        );
        const user = users[0];

        if (!user || !verifyPassword(password, user.password_hash)) {
            return response.status(401).render("auth", {
                mode: "login",
                error: "Email या password सही नहीं है।"
            });
        }

        startSession(response, user);
        response.redirect(user.role === "admin" ? "/admin" : "/");
    } catch (error) {
        next(error);
    }
});

app.post("/logout", (request, response) => {
    const cookies = getCookies(request);
    sessions.delete(cookies.krishi_session);

    response.setHeader(
        "Set-Cookie",
        "krishi_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
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

// ---------- AI chat ----------

app.post("/api/chat", async (request, response) => {
    if (!process.env.GEMINI_API_KEY) {
        return response.json({
            answer: "Demo mode\n\nअपनी फसल, मिट्टी और समस्या बताइए।\nमैं सुरक्षित कृषि सलाह देने में मदद करूँगा।"
        });
    }

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const prompt = `You are Krishi Rakshak, an Indian agriculture assistant.
Reply in simple Hindi/Hinglish using this exact readable format:
समस्या समझें:
[one short line]

क्या करें:
1. [first practical step]
2. [second practical step]

सावधानी:
[one short safety note]

Do not write one long paragraph. Use short lines and blank lines between sections.
Farmer question: ${request.body.question}`;

        const result = await ai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: prompt
        });

        response.json({ answer: result.text });
    } catch (error) {
        console.error("AI chat error:", error.message);
        response.status(502).json({
            answer: "AI service अभी उपलब्ध नहीं है।\n\nकृपया थोड़ी देर बाद फिर कोशिश करें।"
        });
    }
});

// The actual crop model can later replace this demo response.
app.post("/api/scan", upload.single("image"), (request, response) => {
    response.json({
        success: true,
        disease: "Leaf Spot",
        confidence: 92
    });
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