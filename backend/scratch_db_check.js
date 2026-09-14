import pg from 'pg';

const connectionString = (() => {
    const value = process.env.DATABASE_URL;
    if (!value) {
      throw new Error('DATABASE_URL environment variable is required.');
    }
    return value;
  })();

async function main() {
  const client = new pg.Client({ connectionString });
  await client.connect();
  console.log("Connected to DB.");

  console.log("=== USERS ===");
  const users = await client.query("SELECT * FROM users");
  console.table(users.rows);

  console.log("=== MEMBERSHIPS ===");
  const memberships = await client.query("SELECT * FROM memberships");
  console.table(memberships.rows);

  console.log("=== COMPANIES ===");
  const companies = await client.query("SELECT * FROM companies");
  console.table(companies.rows);

  await client.end();
}

main().catch(console.error);
