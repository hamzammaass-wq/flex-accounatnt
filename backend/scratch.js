import pg from 'pg';
const client = new pg.Client({connectionString: 'postgresql://neondb_owner:npg_ObNa5h9szHdc@ep-damp-lake-apz7pu13-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require'});
client.connect().then(() => client.query("SELECT kcu.table_name, kcu.column_name FROM information_schema.table_constraints t JOIN information_schema.key_column_usage kcu ON t.constraint_name = kcu.constraint_name AND t.table_schema = kcu.table_schema WHERE t.constraint_type = 'PRIMARY KEY' AND t.table_schema='public'")).then(res => { console.table(res.rows); client.end(); }).catch(console.error);
