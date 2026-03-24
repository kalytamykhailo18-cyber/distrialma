"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ConfirmModal from "@/components/ConfirmModal";
import { ALL_PERMISSIONS } from "@/lib/permissions";

interface UserRecord {
  id: number;
  username: string;
  role: string;
  permissions: string[];
  createdAt: string;
}

export default function UsuariosPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [formUsername, setFormUsername] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formPerms, setFormPerms] = useState<string[]>([]);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmUser, setConfirmUser] = useState<UserRecord | null>(null);

  const allPermKeys = ALL_PERMISSIONS.map((p) => p.key);
  const allSelected = allPermKeys.every((k) => formPerms.includes(k));

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      setUsers(data.users || []);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }

  function togglePerm(key: string) {
    setFormPerms((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  }

  function toggleAll() {
    setFormPerms(allSelected ? [] : [...allPermKeys]);
  }

  function openCreateForm() {
    setEditingUser(null);
    setFormUsername("");
    setFormPassword("");
    setFormPerms([]);
    setError("");
    setShowForm(true);
  }

  function openEditForm(user: UserRecord) {
    setEditingUser(user);
    setFormUsername(user.username);
    setFormPassword("");
    setFormPerms(user.role === "admin" && user.permissions.length === 0 ? [...allPermKeys] : [...user.permissions]);
    setError("");
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingUser(null);
    setError("");
  }

  async function handleSubmit() {
    setError("");

    if (!formUsername.trim()) {
      setError("El nombre de usuario es obligatorio");
      return;
    }
    if (!editingUser && !formPassword.trim()) {
      setError("La contraseña es obligatoria");
      return;
    }
    if (formPerms.length === 0) {
      setError("Selecciona al menos un permiso");
      return;
    }

    setSaving(true);

    try {
      if (editingUser) {
        const body: { id: number; username?: string; password?: string; permissions: string[] } = {
          id: editingUser.id,
          permissions: formPerms,
        };
        if (formUsername !== editingUser.username) body.username = formUsername;
        if (formPassword) body.password = formPassword;

        const res = await fetch("/api/admin/users", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Error al actualizar");
          return;
        }
      } else {
        const res = await fetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: formUsername.trim(),
            password: formPassword,
            permissions: formPerms,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Error al crear");
          return;
        }
      }

      setShowForm(false);
      setEditingUser(null);
      await loadUsers();
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteConfirmed() {
    if (!confirmUser) return;

    setDeletingId(confirmUser.id);
    try {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: confirmUser.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al eliminar");
        return;
      }
      await loadUsers();
    } catch {
      setError("Error de conexión");
    } finally {
      setDeletingId(null);
      setConfirmUser(null);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usuarios</h1>
          <p className="text-sm text-gray-500 mt-1">Crear y administrar usuarios con acceso al panel.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={openCreateForm}
            disabled={showForm}
            className="px-4 py-2 bg-brand-400 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50"
          >
            Nuevo usuario
          </button>
          <Link
            href="/admin"
            className="bg-white text-gray-700 px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 hover:border-brand-400 hover:text-brand-600 transition-colors"
          >
            Volver
          </Link>
        </div>
      </div>

      {error && !showForm && (
        <p className="text-sm text-red-600 mb-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* Create/Edit form */}
      {showForm && (
        <div className="bg-gray-50 rounded-lg border p-4 mb-4">
          <h3 className="font-medium text-gray-900 mb-3">
            {editingUser ? `Editar: ${editingUser.username}` : "Nuevo usuario"}
          </h3>
          {error && (
            <p className="text-sm text-red-600 mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Usuario</label>
              <input
                type="text"
                value={formUsername}
                onChange={(e) => setFormUsername(e.target.value)}
                placeholder="nombre de usuario"
                disabled={saving}
                className="w-full px-3 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {editingUser ? "Nueva contraseña (dejar vacío para no cambiar)" : "Contraseña"}
              </label>
              <input
                type="password"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                placeholder={editingUser ? "sin cambios" : "contraseña"}
                disabled={saving}
                className="w-full px-3 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Permissions checkboxes */}
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-2">Permisos</label>
            <div className="bg-white rounded-lg border p-3">
              <label className="flex items-center gap-2 mb-2 pb-2 border-b cursor-pointer">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  disabled={saving}
                  className="rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                />
                <span className="text-sm font-medium text-gray-900">Acceso total</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ALL_PERMISSIONS.map((p) => (
                  <label key={p.key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formPerms.includes(p.key)}
                      onChange={() => togglePerm(p.key)}
                      disabled={saving}
                      className="rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                    />
                    <span className="text-sm text-gray-700">{p.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="px-4 py-2 bg-brand-400 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50"
            >
              {saving ? "Guardando..." : editingUser ? "Actualizar" : "Crear"}
            </button>
            <button
              onClick={cancelForm}
              disabled={saving}
              className="px-4 py-2 bg-white text-gray-700 rounded-lg text-sm font-medium border border-gray-200 hover:border-brand-400 disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Users list */}
      {loading ? (
        <div className="bg-white rounded-lg border p-6">
          <p className="text-gray-400 text-sm">Cargando usuarios...</p>
        </div>
      ) : users.length === 0 ? (
        <div className="bg-white rounded-lg border p-6">
          <p className="text-gray-400 text-sm">No hay usuarios creados.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border divide-y">
          {users.map((user) => (
            <div key={user.id} className="px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900 text-sm">{user.username}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(user.createdAt).toLocaleDateString("es-AR")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => openEditForm(user)}
                    disabled={showForm}
                    className="px-3 py-1 text-sm font-medium text-green-600 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 disabled:opacity-50"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => setConfirmUser(user)}
                    disabled={deletingId === user.id}
                    className="px-3 py-1 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50"
                  >
                    {deletingId === user.id ? "..." : "Eliminar"}
                  </button>
                </div>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {(user.role === "admin" && user.permissions.length === 0
                  ? ALL_PERMISSIONS.map((p) => p.key)
                  : user.permissions
                ).map((perm) => {
                  const label = ALL_PERMISSIONS.find((p) => p.key === perm)?.label || perm;
                  return (
                    <span
                      key={perm}
                      className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-brand-50 text-brand-700 border border-brand-200"
                    >
                      {label}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        open={!!confirmUser}
        message={`¿Eliminar el usuario "${confirmUser?.username}"?`}
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setConfirmUser(null)}
        loading={deletingId !== null}
      />
    </div>
  );
}
