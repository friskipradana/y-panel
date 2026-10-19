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
		id: "<b>Uji kirim berhasil</b>\nKanal ini sudah terhubung ke Reneo. Notifikasi panel masuk ke sini sesuai kelompok kabar yang Anda pilih di Pengaturan > Notifikasi.",
		en: "<b>Test message delivered</b>\nThis channel is connected to Reneo. Panel notices arrive here according to the groups you chose in Settings > Notifications.",
	},
	EventOrderCreated: {
		id: "<b>Pesanan baru #{order}</b>\nPembeli: {username}\nPaket: {plan}, {period}\nJenis: {kind}\nTotal: {amount}\nVoucher: {voucher}\nAlamat panel: {address}\n\nLihat di Pengaturan > Hosting > Pesanan.",
		en: "<b>New order #{order}</b>\nBuyer: {username}\nPlan: {plan}, {period}\nKind: {kind}\nTotal: {amount}\nVoucher: {voucher}\nPanel address: {address}\n\nSee it in Settings > Hosting > Orders.",
	},
	EventOrderReview: {
		id: "<b>Pesanan #{order} perlu diperiksa</b>\nPembeli: {username}\nAlasan: {reason}\n\nPutuskan di Pengaturan > Hosting > Pesanan.",
		en: "<b>Order #{order} needs review</b>\nBuyer: {username}\nReason: {reason}\n\nDecide in Settings > Hosting > Orders.",
	},
	EventOrderPaid: {
		id: "<b>Pesanan #{order} lunas</b>\nPembeli: {username}\nPaket: {plan}\nTotal: {amount}\nCara: {note}\n\nAkun dan paketnya sudah aktif.",
		en: "<b>Order #{order} paid</b>\nBuyer: {username}\nPlan: {plan}\nTotal: {amount}\nHow: {note}\n\nThe account and its plan are active.",
	},
	EventOrderAttention: {
		id: "<b>Pesanan perlu ditangani</b>\n{detail}\n\nBuka Pengaturan > Hosting > Pesanan.",
		en: "<b>An order needs your attention</b>\n{detail}\n\nOpen Settings > Hosting > Orders.",
	},
	EventPlanEnded: {
		id: "<b>Paket pembeli berakhir</b>\nAkun: {username}\nPaket: {plan}\nStatus: akun ditangguhkan\n\nPembeli bisa memperpanjang dari Profil; Anda juga bisa memperpanjangkan di Pengaturan > Pengguna.",
		en: "<b>A buyer plan ended</b>\nAccount: {username}\nPlan: {plan}\nStatus: the account is suspended\n\nThe buyer can renew from Profile; you can also renew it in Settings > Users.",
	},
	EventDomainError: {
		id: "<b>Domain pembeli bermasalah</b>\nDomain: {hostname}\nPemilik: {username}\nMasalah: {note}\n\nPeriksa di Pengaturan > Hosting > Domain.",
		en: "<b>A buyer domain has a problem</b>\nDomain: {hostname}\nOwner: {username}\nProblem: {note}\n\nCheck it in Settings > Hosting > Domains.",
	},
	EventBuyerOrderCreated: {
		id: "<b>Pesanan {plan} diterima</b>\nTerima kasih sudah memesan. Selesaikan pembayaran sebelum {deadline}.\n\nPaket: {plan}, {period}\nTotal transfer: {amount}\nTujuan: {bank} {account}\nAtas nama: {holder}\n\nTransfer harus persis {amount}, sampai angka terakhir, supaya pembayaran Anda terbaca otomatis. Bank atau e-wallet lain dan status pesanan ada di sini:\n{url}",
		en: "<b>Order for {plan} received</b>\nThank you for ordering. Please pay before {deadline}.\n\nPlan: {plan}, {period}\nAmount to transfer: {amount}\nTo: {bank} {account}\nAccount holder: {holder}\n\nTransfer exactly {amount}, down to the last digit, so your payment is read by itself. Other banks and e-wallets, and the status of the order, are here:\n{url}",
	},
	EventBuyerOrderPaid: {
		id: "<b>Pembayaran diterima, akun aktif</b>\nTerima kasih. Paket {plan} sudah aktif.\n\nAkun: {username}\nBerlaku sampai: {until}\nMasuk di: {url}\n\nPakai kata sandi yang Anda buat saat memesan.",
		en: "<b>Payment received, your account is active</b>\nThank you. The {plan} plan is active.\n\nAccount: {username}\nValid until: {until}\nSign in at: {url}\n\nUse the password you made when you ordered.",
	},
	EventBuyerPlanReminder: {
		id: "<b>Paket {plan} segera berakhir</b>\nAkun: {username}\nBerakhir: {until} (sekitar {days} hari lagi)\n\nMasuk ke panel Anda, buka Profil > Paket saya, lalu pilih Perpanjang supaya akun tidak ditangguhkan.",
		en: "<b>Your {plan} plan is running out</b>\nAccount: {username}\nEnds: {until} (about {days} days from now)\n\nSign in to your panel, open Profile > My plan, and choose Renew so the account is not suspended.",
	},
	EventBuyerPlanEnded: {
		id: "<b>Paket {plan} berakhir</b>\nAkun: {username}\nStatus: ditangguhkan karena paket berakhir\n\nHubungi penjual untuk memperpanjang. Akun aktif kembali begitu perpanjangan dibayar.",
		en: "<b>Your {plan} plan ended</b>\nAccount: {username}\nStatus: suspended because the plan ended\n\nContact the seller to renew. The account is active again once the renewal is paid.",
	},
	EventLoginFailed: {
		id: "<b>Peringatan keamanan: login gagal</b>\nAkun: {username}\nPercobaan gagal: {count} dalam {minutes} menit\nAlamat IP: {ips} berbeda (terakhir {ip})\n\nBukan Anda? Ganti kata sandi sekarang.",
		en: "<b>Security warning: failed sign-ins</b>\nAccount: {username}\nFailed attempts: {count} in {minutes} minutes\nIP addresses: {ips} different (last {ip})\n\nNot you? Change your password now.",
	},
	EventLoginLocked: {
		id: "<b>Akun dikunci sementara</b>\nAkun: {username}\nPenyebab: terlalu banyak percobaan masuk yang gagal\n\nBukan Anda? Ganti kata sandi begitu Anda bisa masuk.",
		en: "<b>Account locked for a while</b>\nAccount: {username}\nCause: too many failed sign-ins\n\nNot you? Change your password once you can sign in.",
	},
	EventLoginNew: {
		id: "<b>Masuk dari perangkat baru</b>\nAkun: {username}\nWaktu: {time}\nAlamat IP: {ip}\nPeramban: {browser}\n\nBukan Anda? Ganti kata sandi sekarang.",
		en: "<b>Sign-in from a new device</b>\nAccount: {username}\nTime: {time}\nIP address: {ip}\nBrowser: {browser}\n\nNot you? Change your password now.",
	},
	EventPasswordChanged: {
		id: "<b>Kata sandi diganti</b>\nAkun: {username}\nWaktu: {time}\nDiganti oleh: {by}\n\nBukan Anda? Hubungi pengelola panel sekarang.",
		en: "<b>Password changed</b>\nAccount: {username}\nTime: {time}\nChanged by: {by}\n\nNot you? Contact the panel owner now.",
	},
	EventTokenCreated: {
		id: "<b>Token API baru dibuat</b>\nAkun: {username}\nNama token: {name}\nWaktu: {time}\n\nBukan Anda? Cabut token itu di Pengaturan > Token API & MCP.",
		en: "<b>New API token created</b>\nAccount: {username}\nToken name: {name}\nTime: {time}\n\nNot you? Revoke it in Settings > API & MCP tokens.",
	},
	EventAccountScan: {
		id: "<b>Pemindaian akun terdeteksi</b>\nAlamat IP: {ip}\nNama pengguna dicoba: {count} berbeda\nDalam: {minutes} menit",
		en: "<b>Account scan detected</b>\nIP address: {ip}\nUsernames tried: {count} different\nWithin: {minutes} minutes",
	},
	EventLoginFlood: {
		id: "<b>Serangan login terdistribusi</b>\nLogin gagal: {count} dalam {minutes} menit\nAlamat IP: {ips} berbeda (contoh: {samples})",
		en: "<b>Distributed sign-in attack</b>\nFailed sign-ins: {count} in {minutes} minutes\nIP addresses: {ips} different (for example {samples})",
	},
	EventRequestFlood: {
		id: "<b>Lonjakan permintaan</b>\nDitolak pembatas laju: {count} permintaan dalam {minutes} menit\nAlamat IP: {ips} berbeda (contoh: {samples})\n\nBila lalu lintas lewat Cloudflare, alamat itu bisa saja alamat Cloudflare.",
		en: "<b>Request flood</b>\nRefused by the rate limit: {count} requests in {minutes} minutes\nIP addresses: {ips} different (for example {samples})\n\nIf traffic comes through Cloudflare, those may be Cloudflare addresses.",
	},
	EventOrderAbuse: {
		id: "<b>Penyalahgunaan formulir pesanan</b>\nDitolak: {count} permintaan pesanan atau pemeriksaan alamat dalam {minutes} menit\nAlamat IP: {ips} berbeda (contoh: {samples})",
		en: "<b>Order form abuse</b>\nRefused: {count} order or address check requests in {minutes} minutes\nIP addresses: {ips} different (for example {samples})",
	},
	EventWebhookProbe: {
		id: "<b>Percobaan pada pembaca notifikasi</b>\nPermintaan webhook dengan kunci salah: {count} dalam {minutes} menit\nAlamat IP: {ips} berbeda (contoh: {samples})",
		en: "<b>Probing of the notification reader</b>\nWebhook requests with a wrong key: {count} in {minutes} minutes\nIP addresses: {ips} different (for example {samples})",
	},
}

// brandFooter closes every notice that goes out as text, so a message in a chat is known at a glance as Reneo's. The WhatsApp
// Cloud templates carry their own footer (cloudFooter).
const brandFooter = "\n\n- Reneo"

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
	return fill(text, data, locale) + brandFooter
}

func fill(text string, data map[string]any, locale string) string {
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
		out.WriteString(escape(resolve(data[name], locale)))
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
