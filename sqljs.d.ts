declare module 'sql.js' {
  export interface SqlJsExecResult {
    columns: string[];
    values: Array<Array<unknown>>;
  }

  export interface SqlJsDatabase {
    exec(sql: string, params?: unknown[]): SqlJsExecResult[];
    close(): void;
  }

  export interface SqlJsStatic {
    Database: new (data?: Uint8Array) => SqlJsDatabase;
  }

  export interface SqlJsConfig {
    locateFile?: (file: string) => string;
  }

  export default function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>;
}
