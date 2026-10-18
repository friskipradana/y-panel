package notify

import (
	"fmt"
	"html"
	"strings"
)

// The text of every event, in Indonesian and English. Values are escaped before they go in, so a username or a
// path cannot add markup to a Telegram message. The variant of an alert (first, escalated, ongoing, ended) adds a line.

type texts struct{ id, en string }

var catalog = map[string]texts{
	EventTest: {
		id: "<b>Uji kirim</b>\nPesan ini dikirim dari Reneo untuk memastikan kanal berjalan.",
		en: "<b>Test message</b>\nThis message was sent by Reneo to make sure the channel works.",
	},
	EventOrderCreated: {
		id: "<b>Pesanan baru</b>\n{username} memesan {plan} ({kind}). {amount}",
		en: "<b>New order</b>\n{username} ordered {plan} ({kind}). {amount}",
	},
	EventOrderReview: {
		id: "<b>Perlu diperiksa</b>\nPesanan #{order} dari {username}: {reason} Buka Pengaturan > Hosting > Pesanan.",
		en: "<b>Needs review</b>\nOrder #{order} from {username}: {reason} Open Settings > Hosting > Orders.",
	},
	EventOrderPaid: {
		id: "<b>Pesanan terbayar</b>\n{username}: paket {plan} aktif. {note}",
		en: "<b>Order paid</b>\n{username}: the {plan} plan is active. {note}",
	},
	EventOrderAttention: {
		id: "<b>Perlu ditangani</b>\n{detail}",
		en: "<b>Needs your attention</b>\n{detail}",
	},
	EventPlanEnded: {
		id: "<b>Paket berakhir</b>\n{username}: paket {plan} berakhir dan akun ditangguhkan.",
		en: "<b>Plan ended</b>\n{username}: the {plan} plan ended and the account was suspended.",
	},
	EventDomainError: {
		id: "<b>Domain bermasalah</b>\n{hostname} ({username}): {note}",
		en: "<b>Domain problem</b>\n{hostname} ({username}): {note}",
	},
	EventLoginFailed: {
		id: "<b>Peringatan keamanan</b>\n{count} percobaan masuk gagal ke akun {username} dalam {minutes} menit, dari {ips} alamat IP (terakhir {ip}). Jika itu bukan Anda, ganti kata sandi sekarang.",
		en: "<b>Security warning</b>\n{count} failed sign-ins to the account {username} in {minutes} minutes, from {ips} addresses (last {ip}). If it was not you, change your password now.",
	},
	EventLoginLocked: {
		id: "<b>Akun dikunci sementara</b>\nAkun {username} dikunci sementara karena terlalu banyak percobaan masuk yang gagal. Jika itu bukan Anda, ganti kata sandi setelah masuk.",
		en: "<b>Account locked for a while</b>\nThe account {username} is locked for a while after too many failed sign-ins. If it was not you, change your password once you are in.",
	},
	EventLoginNew: {
		id: "<b>Masuk dari perangkat baru</b>\nAkun {username} masuk dari {ip} ({browser}) pada {time}. Bukan Anda? Ganti kata sandi sekarang.",
		en: "<b>Sign-in from a new device</b>\nThe account {username} signed in from {ip} ({browser}) at {time}. Not you? Change your password now.",
	},
	EventPasswordChanged: {
		id: "<b>Kata sandi diganti</b>\nKata sandi akun {username} diganti pada {time}. Bukan Anda? Hubungi pengelola panel sekarang.",
		en: "<b>Password changed</b>\nThe password of the account {username} was changed at {time}. Not you? Contact the panel owner now.",
	},
	EventTokenCreated: {
		id: "<b>Token API baru</b>\nToken API \"{name}\" dibuat untuk akun {username} pada {time}. Bukan Anda? Cabut token itu di Pengaturan > Token API & MCP.",
		en: "<b>New API token</b>\nThe API token \"{name}\" was created for the account {username} at {time}. Not you? Revoke it in Settings > API & MCP tokens.",
	},
	EventAccountScan: {
		id: "<b>Pemindaian akun</b>\nAlamat {ip} mencoba {count} nama pengguna berbeda dalam {minutes} menit.",
		en: "<b>Account scan</b>\nThe address {ip} tried {count} different usernames in {minutes} minutes.",
	},
	EventLoginFlood: {
		id: "<b>Serangan login terdistribusi</b>\n{count} login gagal dalam {minutes} menit dari {ips} alamat IP (contoh: {samples}).",
		en: "<b>Distributed sign-in attack</b>\n{count} failed sign-ins in {minutes} minutes from {ips} addresses (for example {samples}).",
	},
	EventRequestFlood: {
		id: "<b>Lonjakan permintaan</b>\n{count} permintaan ditolak pembatas laju dalam {minutes} menit, dari {ips} alamat IP (contoh: {samples}). Bila lalu lintas lewat Cloudflare, alamat itu bisa saja alamat Cloudflare.",
		en: "<b>Request flood</b>\n{count} requests were refused by the rate limit in {minutes} minutes, from {ips} addresses (for example {samples}). If traffic comes through Cloudflare, those may be Cloudflare addresses.",
	},
	EventOrderAbuse: {
		id: "<b>Penyalahgunaan formulir pesanan</b>\n{count} permintaan pesanan atau pemeriksaan alamat ditolak dalam {minutes} menit, dari {ips} alamat IP (contoh: {samples}).",
		en: "<b>Order form abuse</b>\n{count} order or address check requests were refused in {minutes} minutes, from {ips} addresses (for example {samples}).",
	},
	EventWebhookProbe: {
		id: "<b>Percobaan pada pembaca notifikasi</b>\n{count} permintaan webhook dengan kunci salah dalam {minutes} menit, dari {ips} alamat IP (contoh: {samples}).",
		en: "<b>Probing of the notification reader</b>\n{count} webhook requests with a wrong key in {minutes} minutes, from {ips} addresses (for example {samples}).",
	},
}

var variantLines = map[string]texts{
	"escalated": {id: "Meningkat ke tingkat {level}.", en: "Raised to level {level}."},
	"ongoing":   {id: "Masih berlangsung: {since} kejadian sejak pesan terakhir.", en: "Still going on: {since} events since the last message."},
	"ended":     {id: "Sudah reda. Total {total} kejadian selama {duration}.", en: "It has calmed down. {total} events in total over {duration}."},
}

// Known says whether the catalog has this event
func Known(event string) bool {
	_, ok := catalog[event]
	return ok
}

// Render makes the text of an event for a language ("id" or "en"; anything else is Indonesian). The data fills the
// {name} placeholders; a missing value becomes a dash instead of staying as a raw placeholder.
func Render(event, locale string, data map[string]any) string {
	t, ok := catalog[event]
	if !ok {
		return ""
	}
	pick := func(x texts) string {
		if locale == "en" {
			return x.en
		}
		return x.id
	}
	text := pick(t)
	if variant, _ := data["variant"].(string); variant != "" {
		if line, ok := variantLines[variant]; ok {
			text += "\n" + pick(line)
		}
	}
	return fill(text, data)
}

func fill(text string, data map[string]any) string {
	var out strings.Builder
	for {
		i := strings.IndexByte(text, '{')
		if i < 0 {
			out.WriteString(text)
			return out.String()
		}
		j := strings.IndexByte(text[i:], '}')
		if j < 0 {
			out.WriteString(text)
			return out.String()
		}
		out.WriteString(text[:i])
		name := text[i+1 : i+j]
		out.WriteString(escape(data[name]))
		text = text[i+j+1:]
	}
}

func escape(v any) string {
	switch value := v.(type) {
	case nil:
		return "-"
	case string:
		if strings.TrimSpace(value) == "" {
			return "-"
		}
		return html.EscapeString(value)
	case float64:
		if value == float64(int64(value)) {
			return fmt.Sprintf("%d", int64(value))
		}
		return fmt.Sprintf("%g", value)
	default:
		return html.EscapeString(fmt.Sprint(value))
	}
}
