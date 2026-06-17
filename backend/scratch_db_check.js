import pg from 'pg';

const connectionString = "postgresql://neondb_owner:npg_ObNa5h9szHdc@ep-damp-lake-apz7pu13-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require";

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
