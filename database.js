const mysql = require("mysql2/promise");
const crypto = require("crypto");

require("dotenv").config();

// =====================================================
// DATABASE CONFIG
// =====================================================

const config = {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "krishi_rakshak"
};

// TiDB Cloud / SSL
const useSSL = process.env.DB_SSL === "true";

const sslOptions = useSSL
    ? {
        minVersion: "TLSv1.2",
        rejectUnauthorized: true
    }
    : undefined;


// =====================================================
// DATABASE POOL
// =====================================================

let pool = null;


// =====================================================
// PASSWORD HASH
// =====================================================

function hashPassword(
    password,
    salt = crypto.randomBytes(16).toString("hex")
) {
    const passwordHash = crypto
        .scryptSync(password, salt, 64)
        .toString("hex");

    return `${salt}:${passwordHash}`;
}


// =====================================================
// CHECK COLUMN
// =====================================================

async function columnExists(table, column) {
    if (!pool) {
        throw new Error("Database pool is not initialized.");
    }

    const [rows] = await pool.query(
        `
        SELECT 1
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME = ?
          AND COLUMN_NAME = ?
        LIMIT 1
        `,
        [config.database, table, column]
    );

    return rows.length > 0;
}


// =====================================================
// ADD COLUMN IF MISSING
// =====================================================

async function addColumnIfMissing(table, column, definition) {
    if (!pool) {
        throw new Error("Database pool is not initialized.");
    }

    const exists = await columnExists(table, column);

    if (!exists) {
        await pool.query(
            `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`
        );

        console.log(`Added column: ${table}.${column}`);
        return true;
    }

    return false;
}


// =====================================================
// CHECK INDEX
// =====================================================

async function indexExists(table, indexName) {
    if (!pool) {
        throw new Error("Database pool is not initialized.");
    }

    const [rows] = await pool.query(
        `
        SELECT 1
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME = ?
          AND INDEX_NAME = ?
        LIMIT 1
        `,
        [config.database, table, indexName]
    );

    return rows.length > 0;
}


// =====================================================
// INITIALIZE DATABASE
// =====================================================

async function initializeDatabase() {

    console.log("Starting MySQL initialization...");
    console.log(`Database Host: ${config.host}`);
    console.log(`Database Port: ${config.port}`);
    console.log(`Database Name: ${config.database}`);

    // -------------------------------------------------
    // STEP 1: CONNECT WITHOUT DATABASE
    // -------------------------------------------------

    let setupConnection;

    try {
        setupConnection = await mysql.createConnection({
            host: config.host,
            port: config.port,
            user: config.user,
            password: config.password,
            ssl: sslOptions
        });

        console.log("MySQL server connection successful.");

        // -------------------------------------------------
        // CREATE DATABASE IF NOT EXISTS
        // -------------------------------------------------

        await setupConnection.query(
            `
            CREATE DATABASE IF NOT EXISTS \`${config.database}\`
            CHARACTER SET utf8mb4
            COLLATE utf8mb4_unicode_ci
            `
        );

        console.log(`Database ready: ${config.database}`);

    } finally {
        if (setupConnection) {
            await setupConnection.end();
        }
    }


    // -------------------------------------------------
    // STEP 2: CREATE MAIN CONNECTION POOL
    // -------------------------------------------------

    pool = mysql.createPool({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,

        ssl: sslOptions,

        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });

    if (!pool) {
        throw new Error("MySQL connection pool could not be created.");
    }

    console.log("MySQL connection pool created.");


    // -------------------------------------------------
    // STEP 3: TEST POOL CONNECTION
    // -------------------------------------------------

    await pool.query("SELECT 1");

    console.log("MySQL pool connection test successful.");


    // =================================================
    // USERS TABLE
    // =================================================

    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id CHAR(36) PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            email VARCHAR(255) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            role ENUM('farmer', 'admin') NOT NULL DEFAULT 'farmer',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    console.log("Users table ready.");


    // =================================================
    // USERS MIGRATIONS
    // =================================================

    const emailVerifiedWasAdded = await addColumnIfMissing(
        "users",
        "email_verified",
        "BOOLEAN NOT NULL DEFAULT FALSE"
    );

    await addColumnIfMissing(
        "users",
        "verification_status",
        "VARCHAR(20) NOT NULL DEFAULT 'pending'"
    );

    // IMPORTANT:
    // Do NOT use:
    // VARCHAR(255) NULL UNIQUE
    //
    // Some MySQL/TiDB setups reject UNIQUE during ALTER TABLE.
    // First create normal column, then create index separately.

    await addColumnIfMissing(
        "users",
        "google_id",
        "VARCHAR(255) NULL"
    );

    await addColumnIfMissing(
        "users",
        "profile_picture",
        "VARCHAR(500) NULL"
    );


    // -------------------------------------------------
    // MARK OLD USERS VERIFIED
    // -------------------------------------------------

    if (emailVerifiedWasAdded) {
        await pool.query(
            `
            UPDATE users
            SET email_verified = TRUE,
                verification_status = 'verified'
            `
        );
    }


    // -------------------------------------------------
    // GOOGLE ID UNIQUE INDEX
    // -------------------------------------------------

    const googleIndexExists = await indexExists(
        "users",
        "idx_users_google_id"
    );

    if (!googleIndexExists) {
        try {
            await pool.query(`
                CREATE UNIQUE INDEX idx_users_google_id
                ON users (google_id)
            `);

            console.log("Google ID unique index created.");

        } catch (error) {

            // If duplicate google_id values already exist,
            // don't crash the whole application.
            console.warn(
                "Could not create Google ID unique index:",
                error.message
            );
        }
    }


    // =================================================
    // USER SESSIONS
    // =================================================

    await pool.query(`
        CREATE TABLE IF NOT EXISTS user_sessions (
            id CHAR(64) PRIMARY KEY,
            user_id CHAR(36) NOT NULL,
            expires_at DATETIME NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

            INDEX (user_id),
            INDEX (expires_at),

            FOREIGN KEY (user_id)
            REFERENCES users(id)
            ON DELETE CASCADE
        )
    `);

    console.log("User sessions table ready.");


    // =================================================
    // EMAIL VERIFICATIONS
    // =================================================

    await pool.query(`
        CREATE TABLE IF NOT EXISTS email_verifications (
            id CHAR(36) PRIMARY KEY,
            user_id CHAR(36) NOT NULL,
            code_hash CHAR(64) NOT NULL,
            expires_at DATETIME NOT NULL,
            consumed_at DATETIME NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

            INDEX (user_id),
            INDEX (expires_at),

            FOREIGN KEY (user_id)
            REFERENCES users(id)
            ON DELETE CASCADE
        )
    `);

    console.log("Email verification table ready.");


    // =================================================
    // COMMUNITY QUESTIONS
    // =================================================

    await pool.query(`
        CREATE TABLE IF NOT EXISTS community_questions (
            id CHAR(36) PRIMARY KEY,
            user_id CHAR(36) NOT NULL,
            question TEXT NOT NULL,
            category VARCHAR(100) NULL,

            status ENUM(
                'pending',
                'active',
                'rejected',
                'deleted'
            ) NOT NULL DEFAULT 'active',

            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            moderated_at DATETIME NULL,
            moderated_by CHAR(36) NULL,

            INDEX (status),
            INDEX (created_at),

            FOREIGN KEY (user_id)
            REFERENCES users(id)
            ON DELETE CASCADE
        )
    `);

    console.log("Community questions table ready.");


    // =================================================
    // COMMUNITY ANSWERS
    // =================================================

    await pool.query(`
        CREATE TABLE IF NOT EXISTS community_answers (
            id CHAR(36) PRIMARY KEY,
            question_id CHAR(36) NOT NULL,
            user_id CHAR(36) NOT NULL,
            answer TEXT NOT NULL,

            status ENUM(
                'pending',
                'approved',
                'rejected',
                'deleted'
            ) NOT NULL DEFAULT 'pending',

            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            approved_at DATETIME NULL,
            approved_by CHAR(36) NULL,

            INDEX (question_id),
            INDEX (status),

            FOREIGN KEY (question_id)
            REFERENCES community_questions(id)
            ON DELETE CASCADE,

            FOREIGN KEY (user_id)
            REFERENCES users(id)
            ON DELETE CASCADE
        )
    `);

    console.log("Community answers table ready.");


    // =================================================
    // GOVERNMENT SCHEMES
    // =================================================

    await pool.query(`
        CREATE TABLE IF NOT EXISTS schemes (
            id CHAR(36) PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            state VARCHAR(100) NOT NULL DEFAULT 'All India',
            benefit VARCHAR(255) NOT NULL,
            description TEXT NOT NULL,
            link VARCHAR(500) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    console.log("Schemes table ready.");


    // =================================================
    // ADMIN ACCOUNT
    // =================================================

    const adminName = process.env.ADMIN_NAME?.trim();
    const adminEmail = process.env.ADMIN_EMAIL
        ?.trim()
        .toLowerCase();

    const adminPassword = process.env.ADMIN_PASSWORD;

    if (adminName && adminEmail && adminPassword) {

        const [admins] = await pool.query(
            `
            SELECT id
            FROM users
            WHERE role = 'admin'
            LIMIT 1
            `
        );

        const passwordHash = hashPassword(adminPassword);

        if (admins.length) {

            await pool.query(
                `
                UPDATE users
                SET name = ?,
                    email = ?,
                    password_hash = ?,
                    role = 'admin'
                WHERE id = ?
                `,
                [
                    adminName,
                    adminEmail,
                    passwordHash,
                    admins[0].id
                ]
            );

            console.log("Existing admin account updated.");

        } else {

            await pool.query(
                `
                INSERT INTO users
                (
                    id,
                    name,
                    email,
                    password_hash,
                    role
                )
                VALUES (?, ?, ?, ?, 'admin')
                `,
                [
                    crypto.randomUUID(),
                    adminName,
                    adminEmail,
                    passwordHash
                ]
            );

            console.log("Admin account created.");
        }

    } else {

        console.warn(
            "Admin account not configured. Add ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD."
        );
    }


    // =================================================
    // DEFAULT GOVERNMENT SCHEMES
    // =================================================

    const [existingSchemes] = await pool.query(
        "SELECT id FROM schemes LIMIT 1"
    );

    if (!existingSchemes.length) {

        await pool.query(
            `
            INSERT INTO schemes
            (
                id,
                title,
                state,
                benefit,
                description,
                link
            )
            VALUES ?
            `,
            [[

                [
                    crypto.randomUUID(),
                    "PM-KISAN Samman Nidhi",
                    "All India",
                    "₹6,000 प्रति वर्ष",
                    "छोटे और सीमांत किसानों को सीधे आय सहायता।",
                    "https://pmkisan.gov.in"
                ],

                [
                    crypto.randomUUID(),
                    "Pradhan Mantri Fasal Bima Yojana",
                    "All India",
                    "कम प्रीमियम पर फसल बीमा",
                    "प्राकृतिक आपदा या फसल नुकसान से सुरक्षा।",
                    "https://pmfby.gov.in"
                ],

                [
                    crypto.randomUUID(),
                    "Kisan Credit Card",
                    "All India",
                    "सस्ती कृषि ऋण सुविधा",
                    "बीज, खाद और अन्य खेती की जरूरतों के लिए आसान क्रेडिट।",
                    "https://www.myscheme.gov.in"
                ]

            ]]
        );

        console.log("Default schemes inserted.");
    }


    // =================================================
    // INITIALIZATION COMPLETE
    // =================================================

    console.log("MySQL database initialization completed successfully.");

    return pool;
}


// =====================================================
// DATABASE ACCESS
// =====================================================

function db() {

    if (!pool) {
        throw new Error(
            "Database is not initialized. initializeDatabase() must complete before using db()."
        );
    }

    return pool;
}


// =====================================================
// EXPORTS
// =====================================================

module.exports = {
    initializeDatabase,
    db,
    hashPassword
};