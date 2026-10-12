import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Key,
  Plus,
  Trash2,
  Copy,
  Check,
  Shield,
  ShieldAlert,
  Terminal,
  Code2,
  LoaderCircle,
  ChevronDown,
  ChevronUp,
  Bot,
  Globe,
  ExternalLink,
} from "lucide-react";
import {
  listAPITokens,
  createAPIToken,
  deleteAPIToken,
  type APIToken,
  type CreateAPITokenPayload,
} from "@/api/apiTokens";
import { getMeV2 } from "@/api/auth";
import { copyTextToClipboard } from "@/api/agent";
import { alertLib } from "@/lib/alert";
import { formatDateTimeID } from "@/lib/datetime";
import { PanelSelectMenu } from "@/components/system/PanelSelectMenu";

const EXPIRY_OPTIONS: { label: string; value: CreateAPITokenPayload["expiresIn"] }[] = [
  { label: "30 Hari (Direkomendasikan)", value: "30d" },
  { label: "7 Hari", value: "7d" },
  { label: "90 Hari", value: "90d" },
  { label: "1 Tahun", value: "1y" },
  { label: "Tanpa Kedaluwarsa (Permanen)", value: null },
];

const EXPIRY_SELECT_OPTIONS = EXPIRY_OPTIONS.map((opt) => ({
  value: opt.value ?? "never",
  label: opt.label,
}));

export function ApiTokensTab() {
  const queryClient = useQueryClient();
  const [tokenName, setTokenName] = useState("");
  const [expiresIn, setExpiresIn] = useState<CreateAPITokenPayload["expiresIn"]>("30d");
  const [newlyCreatedToken, setNewlyCreatedToken] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showConfigGuide, setShowConfigGuide] = useState(false);

  // Queries
  const { data: me } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: getMeV2,
  });

  const {
    data: tokens = [],
    isLoading: isTokensLoading,
    refetch: refetchTokens,
  } = useQuery({
    queryKey: ["apiTokens"],
    queryFn: listAPITokens,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (payload: CreateAPITokenPayload) => createAPIToken(payload),
    onSuccess: (data) => {
      setNewlyCreatedToken(data.token);
      setTokenName("");
      setExpiresIn("30d");
      queryClient.invalidateQueries({ queryKey: ["apiTokens"] });
      alertLib.fire("Token Berhasil Dibuat", "Salin token Anda sekarang. Token ini tidak akan ditampilkan lagi.", "success", "settings");
    },
    onError: (err: any) => {
      alertLib.fire("Gagal Membuat Token", err?.response?.data?.error || err.message, "error", "settings");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteAPIToken(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apiTokens"] });
      alertLib.fire("Token Dicabut", "Akses dengan token tersebut telah dinonaktifkan.", "success", "settings");
    },
    onError: (err: any) => {
      alertLib.fire("Gagal Mencabut Token", err?.response?.data?.error || err.message, "error", "settings");
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenName.trim()) return;
    createMutation.mutate({
      name: tokenName.trim(),
      expiresIn,
    });
  };

  const handleDelete = async (token: APIToken) => {
    const confirmed = await alertLib.confirm(
      "Cabut Token Akses?",
      `Apakah Anda yakin ingin menghapus token <strong>"${token.name}"</strong> (${token.tokenPrefix}...)? AI agent atau aplikasi yang menggunakannya akan langsung kehilangan akses.`,
      "Cabut Token",
      "Batal",
      "warning",
      "settings"
    );
    if (confirmed) {
      deleteMutation.mutate(token.id);
    }
  };

  const handleCopy = async (text: string, key: string) => {
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2500);
    }
  };

  const role = me?.role || "user";
  const isAdmin = role === "superadmin" || role === "admin";

  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:8787";
  const tokenPlaceholder = newlyCreatedToken || "ypat_PASTE_TOKEN_ANDA";
  const mcpHttpUrl = `${origin}/mcp?key=${tokenPlaceholder}`;
  const hermesCommand = `hermes mcp add YPANEL --url "${mcpHttpUrl}"`;
  const openclawCommand = `openclaw mcp add YPANEL --transport streamable-http --url "${mcpHttpUrl}"`;

  const claudeConfigSnippet = JSON.stringify(
    {
      mcpServers: {
        ypanel: {
          command: "/usr/local/bin/panel-agent",
          args: ["mcp", "--token", newlyCreatedToken || "ypat_YOUR_TOKEN_HERE"],
        },
      },
    },
    null,
    2
  );

  const cursorConfigSnippet = JSON.stringify(
    {
      mcpServers: {
        ypanel: {
          command: "/opt/ypanel/panel-agent",
          args: ["mcp", "--token", newlyCreatedToken || "ypat_YOUR_TOKEN_HERE"],
        },
      },
    },
    null,
    2
  );

  const remoteSshSnippet = JSON.stringify(
    {
      mcpServers: {
        "ypanel-remote": {
          command: "ssh",
          args: [
            "root@IP_SERVER_ANDA",
            `/opt/ypanel/panel-agent mcp --token ${newlyCreatedToken || "ypat_YOUR_TOKEN_HERE"}`,
          ],
        },
      },
    },
    null,
    2
  );

  return (
    <div className="space-y-4">
      {/* ── Header & Account Permission Scope Banner ── */}
      <div className="panel-shell-card p-4.5 flex flex-col gap-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="panel-muted-block flex h-8 w-8 items-center justify-center rounded-lg text-[var(--win-text)]">
              <Key size={18} className="text-[var(--panel-primary-text)]" />
            </div>
            <div>
              <h3 className="text-[13.5px] font-semibold text-[var(--win-text)]">
                API Key & Token MCP
              </h3>
              <p className="text-[11.5px] text-[var(--text-secondary)]">
                Token otentikasi pribadi untuk MCP server (Claude Desktop, Cursor) & REST API YPanel.
              </p>
            </div>
          </div>

          {/* Current Role Pill & Public Guide Link */}
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href="/docs/mcp"
              target="_blank"
              rel="noreferrer"
              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Bot size={13} />
              <span>Panduan Publik Hermes & AI</span>
              <ExternalLink size={10} className="opacity-70" />
            </a>
            <span
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${
                isAdmin
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                  : "bg-blue-500/10 text-blue-400 border-blue-500/30"
              }`}
            >
              Role Akun: {role.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Dynamic RBAC Explainer */}
        <div
          className={`p-3 rounded-xl border text-[11.5px] leading-relaxed flex items-start gap-2.5 ${
            isAdmin
              ? "bg-amber-500/5 border-amber-500/20 text-[var(--win-text)]"
              : "bg-blue-500/5 border-blue-500/20 text-[var(--win-text)]"
          }`}
        >
          {isAdmin ? (
            <Shield size={16} className="text-amber-400 shrink-0 mt-0.5" />
          ) : (
            <ShieldAlert size={16} className="text-blue-400 shrink-0 mt-0.5" />
          )}
          <div>
            {isAdmin ? (
              <>
                <strong className="text-amber-400 font-semibold">Akses Penuh Administrator (22 Tools MCP Aktif):</strong>
                <p className="text-[var(--text-secondary)] mt-0.5">
                  Token yang Anda buat memiliki hak istimewa <strong>{role}</strong>. AI Agent MCP dapat mengakses eksekusi shell host (Terminal root), manajemen lifecycle seluruh container Docker, manipulasi file sistem, manajemen proyek, pengguna server, dan DNS Cloudflare.
                </p>
              </>
            ) : (
              <>
                <strong className="text-blue-400 font-semibold">Akses Terbatas Sesuai Kuota Akun (MCP Scoped):</strong>
                <p className="text-[var(--text-secondary)] mt-0.5">
                  Token dibatasi sesuai hak akses akun <strong>user</strong> Anda. AI Agent MCP dapat mengelola proyek milik Anda sendiri, memantau status sistem & Cloudflare, serta membaca container yang diizinkan. Eksekusi terminal host dan manajemen pengguna dinonaktifkan demi keamanan.
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Newly Generated Token Alert (Shown once) ── */}
      {newlyCreatedToken && (
        <div className="panel-shell-card p-4.5 border-2 border-emerald-500/50 bg-emerald-500/5 flex flex-col gap-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold text-[13px]">
              <Check size={16} />
              <span>Token Berhasil Dibuat! Simpan Sekarang</span>
            </div>
            <button
              type="button"
              onClick={() => setNewlyCreatedToken(null)}
              className="text-[11.5px] text-[var(--text-secondary)] hover:text-[var(--win-text)] cursor-pointer"
            >
              Tutup Notifikasi
            </button>
          </div>

          <p className="text-[12px] text-[var(--text-secondary)]">
            Demi keamanan, nilai token ini <strong>hanya ditampilkan satu kali</strong>. Harap salin dan simpan di tempat yang aman.
          </p>

          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={newlyCreatedToken}
              className="panel-input panel-mono flex-1 h-[40px] px-3.5 text-[12.5px] font-semibold text-emerald-400 bg-black/20"
            />
            <button
              type="button"
              onClick={() => handleCopy(newlyCreatedToken, "newToken")}
              className="panel-btn panel-btn--primary h-[40px] px-4 rounded-xl text-[12px] font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              {copiedKey === "newToken" ? <Check size={14} /> : <Copy size={14} />}
              <span>{copiedKey === "newToken" ? "Tersalin!" : "Salin Token"}</span>
            </button>
          </div>

          {/* 1-Click Quick Connect Presets (IDCloudHost / Hermes Agent ATM) */}
          <div className="pt-2 border-t border-emerald-500/20 grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Hermes Agent Quick Card */}
            <div className="p-3 rounded-xl bg-black/30 border border-emerald-500/30 flex flex-col justify-between gap-2">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[12px] font-semibold text-emerald-300">
                    <Bot size={14} />
                    <span>Hermes Agent CLI</span>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-medium">
                    1-Click Add
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] mt-1">
                  Hubungkan langsung ke terminal Hermes Agent:
                </p>
                <code className="panel-mono text-[10.5px] text-amber-300 block p-2 rounded-lg bg-black/40 mt-1.5 break-all">
                  {hermesCommand}
                </code>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(hermesCommand, "quickHermes")}
                className="panel-btn panel-btn--primary !h-8 !text-[11px] font-medium w-full flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {copiedKey === "quickHermes" ? <Check size={12} /> : <Copy size={12} />}
                <span>{copiedKey === "quickHermes" ? "Perintah Tersalin!" : "Salin Perintah Hermes"}</span>
              </button>
            </div>

            {/* OpenClaw / Streamable HTTP Quick Card */}
            <div className="p-3 rounded-xl bg-black/30 border border-emerald-500/30 flex flex-col justify-between gap-2">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[12px] font-semibold text-emerald-300">
                    <Globe size={14} />
                    <span>OpenClaw / Streamable HTTP</span>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-medium">
                    HTTP Transport
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] mt-1">
                  Integrasi via transport streamable-http:
                </p>
                <code className="panel-mono text-[10.5px] text-amber-300 block p-2 rounded-lg bg-black/40 mt-1.5 break-all">
                  {openclawCommand}
                </code>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(openclawCommand, "quickOpenclaw")}
                className="panel-btn panel-btn--primary !h-8 !text-[11px] font-medium w-full flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {copiedKey === "quickOpenclaw" ? <Check size={12} /> : <Copy size={12} />}
                <span>{copiedKey === "quickOpenclaw" ? "Perintah Tersalin!" : "Salin Perintah OpenClaw"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create New Token Form ── */}
      <div className="panel-shell-card p-4.5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h4 className="text-[13px] font-semibold text-[var(--win-text)]">
            Buat Token Baru
          </h4>
          <span className="text-[11px] text-[var(--text-secondary)]">
            Format: <code className="panel-mono text-[10.5px]">ypat_...</code>
          </span>
        </div>

        <form onSubmit={handleCreate} className="flex flex-col sm:flex-row items-end gap-3">
          <div className="flex-1 w-full">
            <label className="block text-[11.5px] font-medium text-[var(--win-text)] mb-1.5">
              Nama / Deskripsi Token
            </label>
            <input
              type="text"
              placeholder="Contoh: Claude Desktop, Cursor IDE, GitHub Actions"
              value={tokenName}
              onChange={(e) => setTokenName(e.target.value)}
              className="panel-input h-[38px] px-3.5 text-[12.5px] w-full"
              maxLength={120}
              required
            />
          </div>

          <div className="w-full sm:w-[220px]">
            <label className="block text-[11.5px] font-medium text-[var(--win-text)] mb-1.5">
              Masa Berlaku
            </label>
            <PanelSelectMenu
              id="api-token-expiry"
              value={expiresIn || "never"}
              onChange={(val) => {
                setExpiresIn(val === "never" ? null : (val as CreateAPITokenPayload["expiresIn"]));
              }}
              options={EXPIRY_SELECT_OPTIONS}
              buttonClassName="!h-[38px] text-[12.5px]"
            />
          </div>

          <button
            type="submit"
            disabled={createMutation.isPending || !tokenName.trim()}
            className="panel-btn panel-btn--primary h-[38px] px-4 rounded-xl text-[12.5px] font-semibold flex items-center justify-center gap-1.5 shrink-0 disabled:opacity-50 cursor-pointer w-full sm:w-auto"
          >
            {createMutation.isPending ? (
              <LoaderCircle size={14} className="animate-spin" />
            ) : (
              <Plus size={14} />
            )}
            <span>Generate Token</span>
          </button>
        </form>
      </div>

      {/* ── Active Tokens List ── */}
      <div className="panel-shell-card p-4.5 flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h4 className="text-[13px] font-semibold text-[var(--win-text)]">
              Token Aktif
            </h4>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--panel-surface-hover)] border border-[var(--win-border)] text-[var(--text-secondary)]">
              {tokens.length}
            </span>
          </div>

          <button
            type="button"
            onClick={() => refetchTokens()}
            className="text-[11px] text-[var(--panel-primary-text)] hover:underline cursor-pointer"
          >
            Muat Ulang
          </button>
        </div>

        {isTokensLoading ? (
          <div className="py-8 flex items-center justify-center gap-2 text-[var(--text-secondary)] text-[12px]">
            <LoaderCircle size={16} className="animate-spin" />
            <span>Memuat daftar token...</span>
          </div>
        ) : tokens.length === 0 ? (
          <div className="py-8 flex flex-col items-center justify-center gap-2 text-center text-[var(--text-secondary)]">
            <Key size={28} className="opacity-40" />
            <p className="text-[12.5px] font-medium text-[var(--win-text)]">Belum ada API Token</p>
            <p className="text-[11.5px] max-w-sm">
              Buat token di atas untuk menghubungkan Claude Desktop, Cursor, atau integrasi skrip otomatisasi.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--win-border)] border border-[var(--win-border)] rounded-xl overflow-hidden bg-[var(--panel-surface)]">
            {tokens.map((token) => (
              <div
                key={token.id}
                className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[var(--panel-surface-hover)] transition-colors"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="panel-muted-block h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                    <Code2 size={15} className="text-[var(--panel-primary-text)]" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[12.5px] font-semibold text-[var(--win-text)] truncate">
                        {token.name}
                      </span>
                      <code className="panel-mono text-[11px] px-2 py-0.5 rounded bg-black/20 text-[var(--text-secondary)] border border-[var(--win-border)]">
                        {token.tokenPrefix}...
                      </code>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-[var(--text-secondary)] mt-1 flex-wrap">
                      <span>Dibuat: {formatDateTimeID(token.createdAt)}</span>
                      <span>•</span>
                      <span>
                        Terakhir digunakan:{" "}
                        {token.lastUsedAt ? formatDateTimeID(token.lastUsedAt) : "Belum pernah"}
                      </span>
                      <span>•</span>
                      <span
                        className={
                          token.expiresAt && new Date(token.expiresAt).getTime() < Date.now()
                            ? "text-red-400 font-medium"
                            : ""
                        }
                      >
                        Kedaluwarsa:{" "}
                        {token.expiresAt ? formatDateTimeID(token.expiresAt) : "Tidak terbatas"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <button
                    type="button"
                    onClick={() => handleDelete(token)}
                    disabled={deleteMutation.isPending}
                    className="panel-icon-btn h-8 w-8 rounded-lg text-[var(--text-secondary)] hover:text-red-400 hover:bg-red-500/10 cursor-pointer transition-colors"
                    title="Cabut Token"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Client Configuration Guide (Collapsible) ── */}
      <div className="panel-shell-card p-4.5 flex flex-col gap-3">
        <button
          type="button"
          onClick={() => setShowConfigGuide(!showConfigGuide)}
          className="flex items-center justify-between text-left cursor-pointer group"
        >
          <div className="flex items-center gap-2.5">
            <Terminal size={16} className="text-[var(--panel-primary-text)]" />
            <div>
              <div className="text-[13px] font-semibold text-[var(--win-text)] group-hover:text-[var(--panel-primary-text)] transition-colors">
                Panduan Integrasi & Akses MCP Server
              </div>
              <div className="text-[11px] text-[var(--text-secondary)]">
                Arsitektur koneksi, cara pasang di Claude Desktop & Cursor, serta opsi Remote SSH VPS.
              </div>
            </div>
          </div>
          {showConfigGuide ? (
            <ChevronUp size={16} className="text-[var(--text-secondary)]" />
          ) : (
            <ChevronDown size={16} className="text-[var(--text-secondary)]" />
          )}
        </button>

        {showConfigGuide && (
          <div className="space-y-4 pt-2 border-t border-[var(--win-border)]">
            {/* Access Target Overview */}
            <div className="p-3 rounded-xl bg-black/20 border border-[var(--win-border)] text-[11.5px] leading-relaxed">
              <span className="font-semibold text-[var(--win-text)] block mb-1">
                📍 Ke Mana Saja MCP Ini Terhubung?
              </span>
              <ul className="list-disc list-inside space-y-0.5 text-[var(--text-secondary)]">
                <li><strong className="text-[var(--win-text)]">Host Linux OS:</strong> CPU, RAM, Disk, Systemd journalctl, dan Filesystem host.</li>
                <li><strong className="text-[var(--win-text)]">Docker Daemon:</strong> Socket <code>/var/run/docker.sock</code> untuk mengontrol container & melihat logs.</li>
                <li><strong className="text-[var(--win-text)]">Panel Agent REST API:</strong> <code>http://localhost:8787</code> untuk Projects, Users, dan Cloudflare.</li>
              </ul>
            </div>

            {/* Modern HTTP Streamable MCP: Hermes Agent & OpenClaw (IDCloudHost pattern) */}
            <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot size={16} className="text-emerald-400" />
                  <span className="text-[12.5px] font-semibold text-emerald-400">
                    1. Hermes Agent CLI (Rekomendasi AI Agent Cepat)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(hermesCommand, "guideHermes")}
                  className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  {copiedKey === "guideHermes" ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copiedKey === "guideHermes" ? "Tersalin!" : "Salin Perintah"}</span>
                </button>
              </div>

              <p className="text-[11.5px] text-[var(--text-secondary)] leading-relaxed">
                Hermes Agent mendukung MCP secara native melalui HTTP Streamable endpoint. Jalankan perintah ini di terminal Anda untuk menghubungkan YPanel:
              </p>

              <pre className="panel-mono text-[11px] p-3 rounded-xl bg-black/40 border border-emerald-500/30 text-amber-300 overflow-x-auto leading-relaxed break-all">
                {hermesCommand}
              </pre>

              {/* OpenClaw option */}
              <div className="pt-2 border-t border-emerald-500/20 flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11.5px] font-semibold text-[var(--win-text)] flex items-center gap-1.5">
                    <Globe size={13} className="text-blue-400" />
                    Atau gunakan OpenClaw CLI (Streamable HTTP):
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(openclawCommand, "guideOpenclaw")}
                    className="text-[11px] text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    {copiedKey === "guideOpenclaw" ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copiedKey === "guideOpenclaw" ? "Tersalin!" : "Salin Perintah"}</span>
                  </button>
                </div>
                <pre className="panel-mono text-[11px] p-2.5 rounded-xl bg-black/40 border border-[var(--win-border)] text-blue-300 overflow-x-auto leading-relaxed break-all">
                  {openclawCommand}
                </pre>
              </div>

              {/* Example Prompts */}
              <div className="pt-2 border-t border-emerald-500/20 text-[11px] text-[var(--text-secondary)] space-y-1">
                <span className="font-semibold text-emerald-300 block">💡 Contoh Perintah Chat di Hermes Agent:</span>
                <p>• <em>"Hermes, cek penggunaan CPU dan RAM server YPanel saya saat ini."</em></p>
                <p>• <em>"Daftar semua container Docker, lalu carikan log container yang error."</em></p>
                <p>• <em>"Buka file /var/www/my-project/config.json dan periksa isinya."</em></p>
              </div>
            </div>

            {/* Remote SSH VPS Setup */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11.5px] font-semibold text-amber-400">
                  2. Skenario Desktop: Claude Desktop / Cursor via SSH Bridge
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(remoteSshSnippet, "remoteSshSnippet")}
                  className="text-[11px] text-[var(--panel-primary-text)] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  {copiedKey === "remoteSshSnippet" ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copiedKey === "remoteSshSnippet" ? "Tersalin!" : "Salin JSON"}</span>
                </button>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] mb-1.5">
                Gunakan ini jika Claude Desktop / Cursor terpasang di laptop Anda, sedangkan YPanel ada di server cloud/VPS:
              </p>
              <pre className="panel-mono text-[11px] p-3 rounded-xl bg-black/30 border border-[var(--win-border)] text-amber-300 overflow-x-auto leading-relaxed">
                {remoteSshSnippet}
              </pre>
            </div>

            {/* Claude Desktop Local Snippet */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11.5px] font-semibold text-[var(--win-text)]">
                  3. Konfigurasi Claude Desktop Lokal (<code>claude_desktop_config.json</code>)
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(claudeConfigSnippet, "claudeSnippet")}
                  className="text-[11px] text-[var(--panel-primary-text)] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  {copiedKey === "claudeSnippet" ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copiedKey === "claudeSnippet" ? "Tersalin!" : "Salin JSON"}</span>
                </button>
              </div>
              <pre className="panel-mono text-[11px] p-3 rounded-xl bg-black/30 border border-[var(--win-border)] text-[var(--win-text)] overflow-x-auto leading-relaxed">
                {claudeConfigSnippet}
              </pre>
            </div>

            {/* Cursor Snippet */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11.5px] font-semibold text-[var(--win-text)]">
                  4. Konfigurasi Cursor IDE (<code>.cursor/mcp.json</code>)
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(cursorConfigSnippet, "cursorSnippet")}
                  className="text-[11px] text-[var(--panel-primary-text)] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  {copiedKey === "cursorSnippet" ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copiedKey === "cursorSnippet" ? "Tersalin!" : "Salin JSON"}</span>
                </button>
              </div>
              <pre className="panel-mono text-[11px] p-3 rounded-xl bg-black/30 border border-[var(--win-border)] text-[var(--win-text)] overflow-x-auto leading-relaxed">
                {cursorConfigSnippet}
              </pre>
            </div>

            {/* Terminal Command Snippet */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11.5px] font-semibold text-[var(--win-text)]">
                  5. Jalankan Manual via Terminal Server (Stdio)
                </span>
                <button
                  type="button"
                  onClick={() =>
                    handleCopy(
                      `/opt/ypanel/panel-agent mcp --token ${newlyCreatedToken || "ypat_YOUR_TOKEN"}`,
                      "cliSnippet"
                    )
                  }
                  className="text-[11px] text-[var(--panel-primary-text)] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  {copiedKey === "cliSnippet" ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copiedKey === "cliSnippet" ? "Tersalin!" : "Salin Perintah"}</span>
                </button>
              </div>
              <pre className="panel-mono text-[11px] p-3 rounded-xl bg-black/30 border border-[var(--win-border)] text-emerald-400 overflow-x-auto leading-relaxed">
                {`/opt/ypanel/panel-agent mcp --token ${newlyCreatedToken || "ypat_YOUR_TOKEN"}`}
              </pre>
            </div>

            {/* REST API Header Snippet */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11.5px] font-semibold text-[var(--win-text)]">
                  6. Penggunaan REST API Langsung via cURL
                </span>
                <button
                  type="button"
                  onClick={() =>
                    handleCopy(
                      `curl -H "Authorization: Bearer ${newlyCreatedToken || "ypat_YOUR_TOKEN"}" http://localhost:8787/api/v1/me`,
                      "curlSnippet"
                    )
                  }
                  className="text-[11px] text-[var(--panel-primary-text)] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  {copiedKey === "curlSnippet" ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copiedKey === "curlSnippet" ? "Tersalin!" : "Salin cURL"}</span>
                </button>
              </div>
              <pre className="panel-mono text-[11px] p-3 rounded-xl bg-black/30 border border-[var(--win-border)] text-[var(--text-secondary)] overflow-x-auto leading-relaxed">
                {`curl -H "Authorization: Bearer ${newlyCreatedToken || "ypat_YOUR_TOKEN"}" http://localhost:8787/api/v1/me`}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
