import sql from "mssql";

const config: sql.config = {
  server: process.env.MSSQL_HOST!,
  port: parseInt(process.env.MSSQL_PORT || "1433"),
  user: process.env.MSSQL_USER!,
  password: process.env.MSSQL_PASSWORD!,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  connectionTimeout: 15000,
  requestTimeout: 15000,
  pool: {
    max: 5,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let pool: sql.ConnectionPool | null = null;
let lastFailure = 0;
const RETRY_COOLDOWN = 30000; // 30 seconds between retry attempts

export async function getPool(): Promise<sql.ConnectionPool> {
  if (pool && pool.connected) {
    return pool;
  }

  // Prevent hammering SQL Server on repeated failures (causes account lockout)
  const now = Date.now();
  if (lastFailure && now - lastFailure < RETRY_COOLDOWN) {
    throw new Error(
      "SQL Server no disponible. Reintentando en unos segundos."
    );
  }

  try {
    pool = await sql.connect(config);
    lastFailure = 0;
    return pool;
  } catch (err) {
    lastFailure = Date.now();
    pool = null;
    throw err;
  }
}

export function getDbName(key: string): string {
  const map: Record<string, string> = {
    productos: process.env.MSSQL_DB_PRODUCTOS!,
    clientes: process.env.MSSQL_DB_CLIENTES!,
    elementos: process.env.MSSQL_DB_ELEMENTOS!,
    pedidos: process.env.MSSQL_DB_PEDIDOS!,
    transas: process.env.MSSQL_DB_TRANSAS!,
    compras: process.env.MSSQL_DB_COMPRAS!,
  };
  return map[key];
}
