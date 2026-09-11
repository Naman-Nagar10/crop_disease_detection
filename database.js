const mysql = require("mysql2/promise");
const crypto = require("crypto");

const config = {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "krishi_rakshak"
};

let pool;

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
    return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
}

async function initializeDatabase() {
    const setupConnection = await mysql.createConnection({ host: config.host, port: config.port, user: config.user, password: config.password });
    await setupConnection.query(`CREATE DATABASE IF NOT EXISTS \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await setupConnection.end();

    pool = mysql.createPool({ ...config, waitForConnections: true, connectionLimit: 10 });
    await pool.query(`CREATE TABLE IF NOT EXISTS users (
        id CHAR(36) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('farmer', 'admin') NOT NULL DEFAULT 'farmer',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS schemes (
        id CHAR(36) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        state VARCHAR(100) NOT NULL DEFAULT 'All India',
        benefit VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        link VARCHAR(500) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // Admin credentials are kept in .env, so they never need to be written in source code.
    const adminName = process.env.ADMIN_NAME;
    const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (adminName && adminEmail && adminPassword) {
        const [admins] = await pool.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
        const passwordHash = hashPassword(adminPassword);

        if (admins.length) {
            await pool.query(
                "UPDATE users SET name = ?, email = ?, password_hash = ? WHERE id = ?",
                [adminName, adminEmail, passwordHash, admins[0].id]
            );
        } else {
            await pool.query(
                "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, 'admin')",
                [crypto.randomUUID(), adminName, adminEmail, passwordHash]
            );
        }
    } else {
        console.warn("Admin account not configured. Add ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD in .env.");
    }

    const [existingSchemes] = await pool.query("SELECT id FROM schemes LIMIT 1");
    if (!existingSchemes.length) await pool.query("INSERT INTO schemes (id, title, state, benefit, description, link) VALUES ?", [[
        [crypto.randomUUID(), "PM-KISAN Samman Nidhi", "All India", "₹6,000 प्रति वर्ष", "छोटे और सीमांत किसानों को सीधे आय सहायता।", "https://pmkisan.gov.in"],
        [crypto.randomUUID(), "Pradhan Mantri Fasal Bima Yojana", "All India", "कम प्रीमियम पर फसल बीमा", "प्राकृतिक आपदा या फसल नुकसान से सुरक्षा।", "https://pmfby.gov.in"],
        [crypto.randomUUID(), "Kisan Credit Card", "All India", "सस्ती कृषि ऋण सुविधा", "बीज, खाद और अन्य खेती की जरूरतों के लिए आसान क्रेडिट।", "https://www.myscheme.gov.in"]
    ]]);
}

function db() { return pool; }
module.exports = { initializeDatabase, db, hashPassword };
