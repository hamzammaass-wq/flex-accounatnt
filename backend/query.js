import pg from 'pg';

const connectionString = "postgresql://neondb_owner:npg_ObNa5h9szHdc@ep-damp-lake-apz7pu13-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require";

async function main() {
  const client = new pg.Client({ connectionString });
  await client.connect();
  
  console.log("Connected to DB.");
  
  const pRes = await client.query("SELECT id, name, kind, stock, company_id FROM products");
  console.log("=== PRODUCTS ===");
  console.table(pRes.rows);

  const whRes = await client.query("SELECT id, name, is_main, company_id FROM warehouses");
  console.log("=== WAREHOUSES ===");
  console.table(whRes.rows);

  const pwsRes = await client.query("SELECT * FROM product_warehouse_stock");
  console.log("=== PRODUCT WAREHOUSE STOCK ===");
  console.table(pwsRes.rows);

  await client.end();
}

main().catch(console.error);
