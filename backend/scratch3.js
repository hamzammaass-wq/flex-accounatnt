import pg from 'pg';
const client = new pg.Client({connectionString: 'postgresql://neondb_owner:npg_ObNa5h9szHdc@ep-damp-lake-apz7pu13-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require'});
client.connect().then(() => client.query("SELECT table_name, column_name FROM information_schema.columns WHERE table_name IN ('invoice_items', 'journal_lines', 'stock_transfer_items', 'product_warehouse_stock') AND column_name = 'company_id';")).then(res => { console.table(res.rows); client.end(); }).catch(console.error);
