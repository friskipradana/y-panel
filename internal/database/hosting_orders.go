package database

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"time"

	"github.com/lib/pq"
)

// ─── Hosting orders ───────────────────────────────────────────────────────────

const (
	OrderNew   = "new"
	OrderRenew = "renew"
	OrderTrial = "trial"

	OrderPending   = "pending"
	OrderReview    = "review"
	OrderPaid      = "paid"
	OrderExpired   = "expired"
	OrderCancelled = "cancelled"
)

// ErrNoFreeTotal is returned when every total in the range of the code is taken by a waiting order
var ErrNoFreeTotal = errors.New("no free payment total right now, try again later")

// ErrSubdomainReserved is returned when another open order already holds the panel address
var ErrSubdomainReserved = errors.New("this name is taken")

type HostingOrder struct {
	ID          int64      `json:"id"`
	PublicID    string     `json:"publicId"`
	Kind        string     `json:"kind"`
	PlanID      *int64     `json:"planId"`
	PlanName    string     `json:"planName"`
	UserID      int64      `json:"userId"`
	Username    string     `json:"username"`
	Periods     int        `json:"periods"`
	AmountBase  int64      `json:"amountBase"`
	UniqueCode  int        `json:"uniqueCode"`
	AmountTotal int64      `json:"amountTotal"`
	Status      string     `json:"status"`
	Note        string     `json:"note"`
	CreatedIP   string     `json:"-"`
	// the panel address picked with the order (empty when the plan has none)
	SubLabel    string `json:"-"`
	SubZoneID   string `json:"-"`
	SubDomain   string `json:"-"`
	SubHostname string `json:"subHostname"`
	CreatedAt   time.Time  `json:"createdAt"`
	ExpiresAt   time.Time  `json:"expiresAt"`
	PaidAt      *time.Time `json:"paidAt"`
	NotifID     *int64     `json:"notifId"`
}

const orderColumns = `o.id, o.public_id, o.kind, o.plan_id, o.plan_name, o.user_id, COALESCE(u.username, ''), o.periods,
	o.amount_base, o.unique_code, o.amount_total, o.status, o.note, o.created_ip, o.sub_label, o.sub_zone_id, o.sub_domain, o.sub_hostname,
	o.created_at, o.expires_at, o.paid_at, o.notif_id`

func scanOrder(row rowScanner) (*HostingOrder, error) {
	var o HostingOrder
	if err := row.Scan(&o.ID, &o.PublicID, &o.Kind, &o.PlanID, &o.PlanName, &o.UserID, &o.Username, &o.Periods,
		&o.AmountBase, &o.UniqueCode, &o.AmountTotal, &o.Status, &o.Note, &o.CreatedIP, &o.SubLabel, &o.SubZoneID, &o.SubDomain, &o.SubHostname, &o.CreatedAt, &o.ExpiresAt, &o.PaidAt, &o.NotifID); err != nil {
		return nil, err
	}
	return &o, nil
}

func newPublicID() (string, error) {
	raw := make([]byte, 12)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return hex.EncodeToString(raw), nil
}

// randomCode is a number from 1 to max, drawn from the system's random source
func randomCode(max int) (int, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(int64(max)))
	if err != nil {
		return 0, err
	}
	return int(n.Int64()) + 1, nil
}

// CreateHostingOrder stores an order. A paid order (amountBase > 0) gets a code from 1 to uniqueMax that makes
// its total different from every waiting order; a free one (a trial) has total 0.
func (m *Manager) CreateHostingOrder(o HostingOrder, uniqueMax int) (*HostingOrder, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	publicID, err := newPublicID()
	if err != nil {
		return nil, err
	}
	paid := o.AmountBase > 0
	if paid && uniqueMax < 1 {
		uniqueMax = 999
	}
	attempts := 1
	if paid {
		attempts = 24
	}
	for i := 0; i < attempts; i++ {
		code, total := 0, int64(0)
		if paid {
			if code, err = randomCode(uniqueMax); err != nil {
				return nil, err
			}
			total = o.AmountBase + int64(code)
		}
		var id int64
		err = m.db.QueryRow(`
			INSERT INTO hosting_orders (public_id, kind, plan_id, plan_name, user_id, periods, amount_base, unique_code, amount_total, status, note, created_ip, expires_at,
				sub_label, sub_zone_id, sub_domain, sub_hostname)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id
		`, publicID, o.Kind, o.PlanID, o.PlanName, o.UserID, o.Periods, o.AmountBase, code, total, o.Status, o.Note, o.CreatedIP, o.ExpiresAt,
				o.SubLabel, o.SubZoneID, o.SubDomain, o.SubHostname).Scan(&id)
		var pqErr *pq.Error
		if errors.As(err, &pqErr) && pqErr.Code == "23505" && pqErr.Constraint == "idx_hosting_orders_sub_reserved" {
			return nil, ErrSubdomainReserved
		}
		if errors.As(err, &pqErr) && pqErr.Code == "23505" && pqErr.Constraint == "idx_hosting_orders_pending_total" {
			continue // that total is taken: draw another code
		}
		if err != nil {
			return nil, err
		}
		return m.GetHostingOrder(id)
	}
	return nil, ErrNoFreeTotal
}

func (m *Manager) GetHostingOrder(id int64) (*HostingOrder, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	o, err := scanOrder(m.db.QueryRow(`SELECT `+orderColumns+` FROM hosting_orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = $1`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return o, err
}

func (m *Manager) GetHostingOrderByPublicID(publicID string) (*HostingOrder, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	o, err := scanOrder(m.db.QueryRow(`SELECT `+orderColumns+` FROM hosting_orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.public_id = $1`, publicID))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return o, err
}

// ListHostingOrders pages through the orders, newest first; userID 0 and status "" mean all
func (m *Manager) ListHostingOrders(userID int64, status string, limit, offset int) ([]HostingOrder, int64, error) {
	if !m.IsConnected() {
		return nil, 0, fmt.Errorf("database not connected")
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	where, args := " WHERE 1=1", []any{}
	if userID > 0 {
		args = append(args, userID)
		where += fmt.Sprintf(" AND o.user_id = $%d", len(args))
	}
	if status != "" {
		args = append(args, status)
		where += fmt.Sprintf(" AND o.status = $%d", len(args))
	}
	var total int64
	if err := m.db.QueryRow(`SELECT COUNT(*) FROM hosting_orders o`+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	args = append(args, limit, offset)
	rows, err := m.db.Query(`SELECT `+orderColumns+` FROM hosting_orders o LEFT JOIN users u ON u.id = o.user_id`+where+
		fmt.Sprintf(` ORDER BY o.created_at DESC, o.id DESC LIMIT $%d OFFSET $%d`, len(args)-1, len(args)), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []HostingOrder{}
	for rows.Next() {
		o, err := scanOrder(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, *o)
	}
	return out, total, rows.Err()
}

// PendingOrdersForTotal returns the waiting orders of exactly this total that are still open at the
// time the payment arrived. The unique index keeps it to one at most; callers still check the count.
func (m *Manager) PendingOrdersForTotal(total int64, at time.Time) ([]HostingOrder, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	rows, err := m.db.Query(`SELECT `+orderColumns+` FROM hosting_orders o LEFT JOIN users u ON u.id = o.user_id
		WHERE o.status = 'pending' AND o.amount_total = $1 AND o.expires_at > $2 AND o.created_at <= $2`, total, at)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []HostingOrder{}
	for rows.Next() {
		o, err := scanOrder(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *o)
	}
	return out, rows.Err()
}

// MarkOrderPaid closes a waiting (or under review) order as paid. It says whether this call did it, so a payment
// that arrives twice, or a confirm that races a match, activates the account once.
func (m *Manager) MarkOrderPaid(id int64, notifID *int64, note string) (bool, error) {
	if !m.IsConnected() {
		return false, fmt.Errorf("database not connected")
	}
	res, err := m.db.Exec(`UPDATE hosting_orders SET status = 'paid', paid_at = NOW(), notif_id = $2, note = CASE WHEN $3 = '' THEN note ELSE $3 END
		WHERE id = $1 AND status IN ('pending', 'review')`, id, notifID, note)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

// SetOrderStatus moves an open order (waiting or under review) to review, cancelled or expired
func (m *Manager) SetOrderStatus(id int64, status, note string) (bool, error) {
	if !m.IsConnected() {
		return false, fmt.Errorf("database not connected")
	}
	if status != OrderReview && status != OrderCancelled && status != OrderExpired {
		return false, fmt.Errorf("an order cannot be moved to %q this way", status)
	}
	res, err := m.db.Exec(`UPDATE hosting_orders SET status = $2, note = CASE WHEN $3 = '' THEN note ELSE $3 END
		WHERE id = $1 AND status IN ('pending', 'review')`, id, status, note)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

// ExpireHostingOrders closes the waiting orders whose time ran out and returns them
func (m *Manager) ExpireHostingOrders(now time.Time) ([]HostingOrder, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	rows, err := m.db.Query(`UPDATE hosting_orders o SET status = 'expired'
		WHERE o.status = 'pending' AND o.expires_at <= $1
		RETURNING o.id, o.public_id, o.kind, o.plan_id, o.plan_name, o.user_id, '', o.periods,
			o.amount_base, o.unique_code, o.amount_total, o.status, o.note, o.created_ip, o.sub_label, o.sub_zone_id, o.sub_domain, o.sub_hostname,
			o.created_at, o.expires_at, o.paid_at, o.notif_id`, now)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []HostingOrder{}
	for rows.Next() {
		o, err := scanOrder(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *o)
	}
	return out, rows.Err()
}

// SubdomainReserved says whether an open order holds this panel address for its buyer
func (m *Manager) SubdomainReserved(hostname string) (bool, error) {
	if !m.IsConnected() {
		return false, fmt.Errorf("database not connected")
	}
	var held bool
	err := m.db.QueryRow(`SELECT EXISTS (SELECT 1 FROM hosting_orders WHERE sub_hostname = $1 AND status IN ('pending', 'review'))`, hostname).Scan(&held)
	return held, err
}

// CountRecentOrdersFromIP counts the orders an address made since a moment: the limit on self-service orders
func (m *Manager) CountRecentOrdersFromIP(ip string, since time.Time, kind string) (int, error) {
	if !m.IsConnected() {
		return 0, fmt.Errorf("database not connected")
	}
	query := `SELECT COUNT(*) FROM hosting_orders WHERE created_ip = $1 AND created_at >= $2`
	args := []any{ip, since}
	if kind != "" {
		query += ` AND kind = $3`
		args = append(args, kind)
	}
	var n int
	err := m.db.QueryRow(query, args...).Scan(&n)
	return n, err
}

// UserOpenOrder returns the order an account is already waiting on, so a renewal is not asked twice
func (m *Manager) UserOpenOrder(userID int64, kind string) (*HostingOrder, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	o, err := scanOrder(m.db.QueryRow(`SELECT `+orderColumns+` FROM hosting_orders o LEFT JOIN users u ON u.id = o.user_id
		WHERE o.user_id = $1 AND o.kind = $2 AND o.status IN ('pending', 'review') AND o.expires_at > NOW()
		ORDER BY o.created_at DESC LIMIT 1`, userID, kind))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return o, err
}
