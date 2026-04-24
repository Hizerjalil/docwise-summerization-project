const { Pool } = require('pg');
require('dotenv').config({ path: '../backend/.env' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function makeAdmin(email) {
    try {
        const res = await pool.query('UPDATE users SET is_admin = true WHERE email = $1 RETURNING *', [email]);
        if (res.rowCount === 0) {
            console.log(`User with email ${email} not found.`);
        } else {
            console.log(`User ${res.rows[0].username} (${email}) is now an admin.`);
        }
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await pool.end();
    }
}

const email = process.argv[2];
if (!email) {
    console.log('Usage: node make_admin.js <email>');
    process.exit(1);
}

makeAdmin(email);
