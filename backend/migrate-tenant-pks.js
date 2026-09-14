import pg from 'pg';

const connectionString = (() => {
    const value = process.env.DATABASE_URL;
    if (!value) {
      throw new Error('DATABASE_URL environment variable is required.');
    }
    return value;
  })();
const client = new pg.Client({ connectionString });

async function runMigration() {
  await client.connect();
  console.log("Connected to database.");

  try {
    await client.query("BEGIN");

    console.log("Adding company_id to junction tables...");
    
    // We already added the columns in the previous partial run, so we use IF NOT EXISTS.
    // However, some columns might be missing if it rolled back.
    await client.query("ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS company_id VARCHAR(50);");
    await client.query("UPDATE journal_lines jl SET company_id = je.company_id FROM journal_entries je WHERE jl.entry_id = je.id;");
    await client.query("ALTER TABLE journal_lines ALTER COLUMN company_id SET NOT NULL;");

    await client.query("ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS company_id VARCHAR(50);");
    await client.query("UPDATE invoice_items ii SET company_id = inv.company_id FROM invoices inv WHERE ii.invoice_id = inv.id;");
    await client.query("ALTER TABLE invoice_items ALTER COLUMN company_id SET NOT NULL;");

    await client.query("ALTER TABLE stock_transfer_items ADD COLUMN IF NOT EXISTS company_id VARCHAR(50);");
    await client.query("UPDATE stock_transfer_items sti SET company_id = st.company_id FROM stock_transfers st WHERE sti.transfer_id = st.id;");
    await client.query("ALTER TABLE stock_transfer_items ALTER COLUMN company_id SET NOT NULL;");

    await client.query("ALTER TABLE product_warehouse_stock ADD COLUMN IF NOT EXISTS company_id VARCHAR(50);");
    await client.query("UPDATE product_warehouse_stock pws SET company_id = p.company_id FROM products p WHERE pws.product_id = p.id;");
    await client.query("ALTER TABLE product_warehouse_stock ALTER COLUMN company_id SET NOT NULL;");

    await client.query("ALTER TABLE employee_contracts ADD COLUMN IF NOT EXISTS company_id VARCHAR(50);");
    await client.query("UPDATE employee_contracts ec SET company_id = e.company_id FROM employees e WHERE ec.employee_id = e.id;");
    await client.query("ALTER TABLE employee_contracts ALTER COLUMN company_id SET NOT NULL;");

    await client.query("ALTER TABLE employee_leave_requests ADD COLUMN IF NOT EXISTS company_id VARCHAR(50);");
    await client.query("UPDATE employee_leave_requests elr SET company_id = e.company_id FROM employees e WHERE elr.employee_id = e.id;");
    await client.query("ALTER TABLE employee_leave_requests ALTER COLUMN company_id SET NOT NULL;");

    await client.query("ALTER TABLE employee_recurring_deductions ADD COLUMN IF NOT EXISTS company_id VARCHAR(50);");
    await client.query("UPDATE employee_recurring_deductions erd SET company_id = e.company_id FROM employees e WHERE erd.employee_id = e.id;");
    await client.query("ALTER TABLE employee_recurring_deductions ALTER COLUMN company_id SET NOT NULL;");


    const fkRes = await client.query(`
      SELECT 
        tc.constraint_name, 
        tc.table_name, 
        kcu.column_name, 
        ccu.table_name AS foreign_table_name, 
        ccu.column_name AS foreign_column_name,
        rc.update_rule,
        rc.delete_rule
      FROM information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema 
      JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
      JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name AND tc.table_schema = rc.constraint_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public';
    `);
    const allFKs = fkRes.rows;

    const pkRes = await client.query(`
      SELECT tc.table_name, tc.constraint_name, kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public';
    `);
    const allPKs = pkRes.rows;

    const tenantTables = [
      'accounts', 'contacts', 'journal_entries', 'journal_lines', 'warehouses', 'products', 
      'product_warehouse_stock', 'stock_transfers', 'stock_transfer_items', 'invoices', 
      'invoice_items', 'invoice_settlements', 'employees', 'employee_contracts', 
      'employee_leave_requests', 'employee_recurring_deductions', 'fixed_asset_groups', 
      'fixed_assets', 'checks', 'audit_logs'
    ];

    const fksToDropAndRecreate = allFKs.filter(fk => tenantTables.includes(fk.foreign_table_name));

    for (const fk of fksToDropAndRecreate) {
      console.log(`Dropping FK ${fk.constraint_name} from ${fk.table_name}`);
      await client.query(`ALTER TABLE ${fk.table_name} DROP CONSTRAINT ${fk.constraint_name};`);
    }

    for (const table of tenantTables) {
      const pks = allPKs.filter(p => p.table_name === table);
      if (pks.length > 0) {
        const pkName = pks[0].constraint_name;
        const pkCols = pks.map(p => p.column_name);
        if (!pkCols.includes('company_id')) {
          console.log(`Dropping PK ${pkName} from ${table}`);
          await client.query(`ALTER TABLE ${table} DROP CONSTRAINT ${pkName} CASCADE;`);
        }
      }
    }

    for (const table of tenantTables) {
      const pks = allPKs.filter(p => p.table_name === table);
      const pkCols = pks.map(p => p.column_name);
      if (!pkCols.includes('company_id')) {
        let newPkCols = ['company_id'];
        if (table === 'product_warehouse_stock') {
           newPkCols.push('product_id', 'warehouse_id');
        } else if (table === 'journal_lines') {
           newPkCols.push('id');
        } else if (table === 'invoice_items') {
           newPkCols.push('id');
        } else if (table === 'stock_transfer_items') {
           newPkCols.push('id');
        } else {
           newPkCols.push('id');
        }
        console.log(`Adding PK to ${table} (${newPkCols.join(', ')})`);
        
        await client.query(`
          DELETE FROM ${table} a USING (
            SELECT MAX(ctid) as max_ctid, company_id, ${newPkCols.filter(c => c !== 'company_id').join(', ')}
            FROM ${table} 
            GROUP BY company_id, ${newPkCols.filter(c => c !== 'company_id').join(', ')} HAVING COUNT(*) > 1
          ) b
          WHERE a.company_id = b.company_id AND ${newPkCols.filter(c => c !== 'company_id').map(c => `a.${c} = b.${c}`).join(' AND ')}
          AND a.ctid <> b.max_ctid;
        `);

        await client.query(`ALTER TABLE ${table} ADD PRIMARY KEY (${newPkCols.join(', ')});`);
      }
    }

    // Clean up corrupted references and Recreate FKs
    for (const fk of fksToDropAndRecreate) {
      // Cleanup corrupt references by setting them to NULL if they don't match company_id
      console.log(`Cleaning up invalid references for ${fk.table_name}.${fk.column_name} referencing ${fk.foreign_table_name}`);
      try {
        await client.query(`
          UPDATE ${fk.table_name} c
          SET ${fk.column_name} = NULL
          WHERE c.${fk.column_name} IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM ${fk.foreign_table_name} p 
            WHERE p.company_id = c.company_id AND p.${fk.foreign_column_name} = c.${fk.column_name}
          );
        `);
      } catch (err) {
        // If the column is NOT NULL, we can't set it to NULL. We must delete the row.
        console.log(`Column might be NOT NULL, deleting corrupt rows from ${fk.table_name} instead.`);
        await client.query(`
          DELETE FROM ${fk.table_name} c
          WHERE c.${fk.column_name} IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM ${fk.foreign_table_name} p 
            WHERE p.company_id = c.company_id AND p.${fk.foreign_column_name} = c.${fk.column_name}
          );
        `);
      }

      let cascadeAction = fk.delete_rule === 'CASCADE' ? 'ON DELETE CASCADE' : '';
      let updateAction = fk.update_rule === 'CASCADE' ? 'ON UPDATE CASCADE' : '';

      console.log(`Recreating FK ${fk.constraint_name} on ${fk.table_name} (${fk.column_name}) -> ${fk.foreign_table_name} (${fk.foreign_column_name})`);
      const query = `
        ALTER TABLE ${fk.table_name}
        ADD CONSTRAINT ${fk.constraint_name}
        FOREIGN KEY (company_id, ${fk.column_name})
        REFERENCES ${fk.foreign_table_name} (company_id, ${fk.foreign_column_name})
        ${updateAction} ${cascadeAction};
      `;
      await client.query(query);
    }

    await client.query("COMMIT");
    console.log("Migration completed successfully.");

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", err);
  } finally {
    await client.end();
  }
}

runMigration();
