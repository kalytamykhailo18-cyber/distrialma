import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { getPool, getDbName } from "./mssql";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Usuario", type: "text" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;

        // 1. Check PostgreSQL users table first (staff/admin accounts take priority)
        const user = await prisma.user.findFirst({
          where: { username: { equals: credentials.username, mode: "insensitive" } },
        });

        if (user) {
          const valid = await bcrypt.compare(
            credentials.password,
            user.passwordHash
          );
          if (!valid) return null;

          let permissions: string[] = [];
          try {
            permissions = JSON.parse(user.permissions || "[]");
          } catch { /* ignore */ }

          return {
            id: String(user.id),
            name: user.username,
            role: user.role,
            permissions,
            empleadoCod: user.empleadoCod || null,
            email: user.email || null,
          };
        }

        // 2. Fall back to SQL Server Clientes table (client accounts)
        try {
          const pool = await getPool();
          const dbClientes = getDbName("clientes");
          const result = await pool
            .request()
            .input("cuit", credentials.username.trim())
            .query(
              `SELECT LTRIM(RTRIM(Cod)) AS cod, LTRIM(RTRIM(Nombre)) AS nombre, LTRIM(RTRIM(ISNULL(Observaciones,''))) AS observaciones, LTRIM(RTRIM(ISNULL(ListaPrecios,''))) AS listaPrecios
               FROM [${dbClientes}].dbo.Clientes
               WHERE LTRIM(RTRIM(CUIT)) = @cuit
                 AND (DeBaja = 0 OR DeBaja IS NULL)`
            );

          if (result.recordset.length > 0) {
            const cliente = result.recordset[0];
            if (cliente.observaciones.toLowerCase() === credentials.password.toLowerCase()) {
              return {
                id: cliente.cod,
                name: cliente.nombre,
                role: cliente.listaPrecios === "3" ? "especial" : "customer",
              };
            }
            return null;
          }
        } catch (err) {
          console.error("SQL Server auth error:", err);
        }

        return null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as unknown as { role: string; id: string; permissions?: string[]; empleadoCod?: string | null; email?: string | null };
        token.role = u.role;
        token.clientId = u.id;
        token.permissions = u.permissions || [];
        token.empleadoCod = u.empleadoCod || null;
        token.userEmail = u.email || null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const u = session.user as { role?: string; clientId?: string; permissions?: string[]; empleadoCod?: string | null; userEmail?: string | null };
        u.role = token.role as string;
        u.clientId = token.clientId as string;
        u.permissions = (token.permissions as string[]) || [];
        u.empleadoCod = (token.empleadoCod as string) || null;
        u.userEmail = (token.userEmail as string) || null;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
};
