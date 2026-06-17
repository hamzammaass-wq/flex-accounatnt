import pg from 'pg';
const client = new pg.Client({connectionString: 'postgresql://neondb_owner:npg_ObNa5h9szHdc@ep-damp-lake-apz7pu13-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require'});
client.connect().then(() => client.query("SELECT data_type, character_maximum_length FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'id';")).then(res => { console.table(res.rows); client.end(); }).catch(console.error);
