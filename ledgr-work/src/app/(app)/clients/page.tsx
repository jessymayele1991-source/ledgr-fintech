"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Users, Mail, Phone, Building2, Pencil, Trash2, X, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";
import { createClientSchema } from "@/lib/validations/schemas";
import type { Client } from "@/types";
import type { z } from "zod";

type ClientForm = z.infer<typeof createClientSchema>;

async function fetchClients(search?: string) {
  const qs = search ? `?search=${encodeURIComponent(search)}` : "";
  const res = await fetch(`/api/clients${qs}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message);
  return json.data as Client[];
}

async function saveClient(data: ClientForm, id?: string) {
  const res = await fetch(id ? `/api/clients/${id}` : "/api/clients", {
    method: id ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message);
  return json.data;
}

async function deleteClient(id: string) {
  const res = await fetch(`/api/clients/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete");
}

function ClientModal({
  open,
  client,
  onClose,
  onSuccess,
}: {
  open: boolean;
  client: Client | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ClientForm>({ resolver: zodResolver(createClientSchema) });

  const mutation = useMutation({ mutationFn: (data: ClientForm) => saveClient(data, client?.id), onSuccess });

  const onSubmit = handleSubmit((data) => mutation.mutate(data));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="font-semibold text-gray-900">{client ? "Edit Client" : "New Client"}</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={onSubmit} className="p-6 space-y-4">
          {mutation.error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
              {(mutation.error as Error).message}
            </div>
          )}
          <div>
            <label className="label">Name *</label>
            <input {...register("name")} defaultValue={client?.name} className={cn("input", errors.name && "border-red-300")} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Email</label>
              <input type="email" {...register("email")} defaultValue={client?.email ?? ""} className="input" />
            </div>
            <div>
              <label className="label">Phone</label>
              <input {...register("phone")} defaultValue={client?.phone ?? ""} className="input" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">VAT Number</label>
              <input {...register("vatNumber")} defaultValue={client?.vatNumber ?? ""} className="input" />
            </div>
            <div>
              <label className="label">IBAN</label>
              <input {...register("iban")} defaultValue={client?.iban ?? ""} className="input font-mono text-sm uppercase" />
            </div>
          </div>
          <div>
            <label className="label">Address</label>
            <input {...register("address")} defaultValue={client?.address ?? ""} className="input" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">City</label>
              <input {...register("city")} defaultValue={client?.city ?? ""} className="input" />
            </div>
            <div>
              <label className="label">Country</label>
              <input {...register("country")} defaultValue={client?.country ?? ""} className="input" />
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea rows={2} {...register("notes")} defaultValue={client?.notes ?? ""} className="input resize-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="btn-primary flex-1">
              {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {client ? "Save Changes" : "Create Client"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ClientsPage() {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients", search],
    queryFn: () => fetchClients(search || undefined),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteClient,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clients"] }),
  });

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("clients.title")}</h1>
          <p className="text-sm text-gray-500 mt-1">{clients.length} clients</p>
        </div>
        <button onClick={() => { setEditingClient(null); setModalOpen(true); }} className="btn-primary">
          <Plus className="w-4 h-4" /> Add Client
        </button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search clients..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input pl-9"
        />
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading clients...</div>
      ) : clients.length === 0 ? (
        <div className="card py-16 text-center space-y-3">
          <Users className="w-12 h-12 text-gray-200 mx-auto" />
          <p className="text-gray-400 text-sm">No clients yet</p>
          <button onClick={() => setModalOpen(true)} className="btn-primary mx-auto">
            <Plus className="w-4 h-4" /> Add your first client
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {clients.map((client) => (
            <div key={client.id} className="card p-5 hover:shadow-md transition-shadow group">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-sm">
                    {client.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{client.name}</p>
                    {client.vatNumber && (
                      <p className="text-xs text-gray-400">{client.vatNumber}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => { setEditingClient(client); setModalOpen(true); }}
                    className="btn-ghost p-1.5"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => confirm("Delete this client?") && deleteMutation.mutate(client.id)}
                    className="btn-ghost p-1.5 hover:text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="mt-4 space-y-1.5">
                {client.email && (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Mail className="w-3.5 h-3.5 text-gray-400" />
                    {client.email}
                  </div>
                )}
                {client.phone && (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Phone className="w-3.5 h-3.5 text-gray-400" />
                    {client.phone}
                  </div>
                )}
                {client.city && (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Building2 className="w-3.5 h-3.5 text-gray-400" />
                    {[client.city, client.country].filter(Boolean).join(", ")}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ClientModal
        open={modalOpen}
        client={editingClient}
        onClose={() => { setModalOpen(false); setEditingClient(null); }}
        onSuccess={() => {
          setModalOpen(false);
          setEditingClient(null);
          queryClient.invalidateQueries({ queryKey: ["clients"] });
        }}
      />
    </div>
  );
}
