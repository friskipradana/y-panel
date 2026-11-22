package database

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

// HostingVoucher is a code a buyer types to pay less: a percent of the price, or a fixed amount of rupiah.
type HostingVoucher struct {
	ID    int64  `json:"id"`
	Code  string `json:"code"`
	Kind  string `json:"kind"`
	Value int64  `json:"value"`
	// MaxUses is how many orders may use the code in all; 0 means no limit
	MaxUses int `json:"maxUses"`
	// MaxPerAccount is how many orders one account may use it on; 0 means no limit
	MaxPerAccount int `json:"maxPerAccount"`
	// AppliesTo: both, new (a first order) or renew
	AppliesTo  string     `json:"appliesTo"`
	PlanIDs    []int64    `json:"planIds"`
	ValidFrom  *time.Time `json:"validFrom"`
	ValidUntil *time.Time `json:"validUntil"`
	Enabled    bool       `json:"enabled"`
	Note       string     `json:"note"`
	CreatedAt  time.Time  `json:"createdAt"`
	// Used counts the orders that hold the code: waiting, under review or paid
	Used int `json:"used"`
}

const (
	VoucherPercent = "percent"
	VoucherFixed   = "fixed"
)

// ErrVoucherUnavailable is a code that ran out between the check and the order
var ErrVoucherUnavailable = errors.New("this voucher can no longer be used")

const voucherColumns = `v.id, v.code, v.kind, v.value, v.max_uses, v.max_per_account, v.applies_to, v.plan_ids, v.valid_from, v.valid_until, v.enabled, v.note, v.created_at,
	(SELECT COUNT(*) FROM hosting_orders o WHERE UPPER(o.voucher_code) = UPPER(v.code) AND o.status IN ('pending', 'review', 'paid'))`

func scanVoucher(row rowScanner) (*HostingVoucher, error) {
	var v HostingVoucher
	var plans []byte
	if err := row.Scan(&v.ID, &v.Code, &v.Kind, &v.Value, &v.MaxUses, &v.MaxPerAccount, &v.AppliesTo, &plans, &v.ValidFrom, &v.ValidUntil, &v.Enabled, &v.Note, &v.CreatedAt, &v.Used); err != nil {
		return nil, err
	}
	v.PlanIDs = []int64{}
	if len(plans) > 0 {
		_ = json.Unmarshal(plans, &v.PlanIDs)
	}
	return &v, nil
}

func (m *Manager) ListHostingVouchers() ([]HostingVoucher, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	rows, err := m.db.Query(`SELECT ` + voucherColumns + ` FROM hosting_vouchers v ORDER BY v.created_at DESC, v.id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []HostingVoucher{}
	for rows.Next() {
		v, err := scanVoucher(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *v)
	}
	return out, rows.Err()
}

// GetHostingVoucherByCode finds a code whatever its letter case
func (m *Manager) GetHostingVoucherByCode(code string) (*HostingVoucher, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	v, err := scanVoucher(m.db.QueryRow(`SELECT `+voucherColumns+` FROM hosting_vouchers v WHERE UPPER(v.code) = UPPER($1)`, strings.TrimSpace(code)))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return v, err
}

func (m *Manager) GetHostingVoucher(id int64) (*HostingVoucher, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	v, err := scanVoucher(m.db.QueryRow(`SELECT `+voucherColumns+` FROM hosting_vouchers v WHERE v.id = $1`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return v, err
}

func (m *Manager) CreateHostingVoucher(v HostingVoucher) (*HostingVoucher, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	plans, _ := json.Marshal(nonNilInts(v.PlanIDs))
	var id int64
	err := m.db.QueryRow(`
		INSERT INTO hosting_vouchers (code, kind, value, max_uses, max_per_account, applies_to, plan_ids, valid_from, valid_until, enabled, note)
		VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11) RETURNING id
	`, v.Code, v.Kind, v.Value, v.MaxUses, v.MaxPerAccount, v.AppliesTo, string(plans), v.ValidFrom, v.ValidUntil, v.Enabled, v.Note).Scan(&id)
	if err != nil {
		return nil, err
	}
	return m.GetHostingVoucher(id)
}

func (m *Manager) UpdateHostingVoucher(v HostingVoucher) (*HostingVoucher, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	plans, _ := json.Marshal(nonNilInts(v.PlanIDs))
	res, err := m.db.Exec(`
		UPDATE hosting_vouchers SET code=$2, kind=$3, value=$4, max_uses=$5, max_per_account=$6, applies_to=$7, plan_ids=$8::jsonb,
			valid_from=$9, valid_until=$10, enabled=$11, note=$12, updated_at=NOW()
		WHERE id=$1
	`, v.ID, v.Code, v.Kind, v.Value, v.MaxUses, v.MaxPerAccount, v.AppliesTo, string(plans), v.ValidFrom, v.ValidUntil, v.Enabled, v.Note)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, nil
	}
	return m.GetHostingVoucher(v.ID)
}

// DeleteHostingVoucher removes the code; the orders that used it keep its name and what it took off
func (m *Manager) DeleteHostingVoucher(id int64) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`DELETE FROM hosting_vouchers WHERE id = $1`, id)
	return err
}

// VoucherUsesByAccount is how many orders of one account hold the code
func (m *Manager) VoucherUsesByAccount(code string, userID int64) (int, error) {
	if !m.IsConnected() {
		return 0, fmt.Errorf("database not connected")
	}
	var n int
	err := m.db.QueryRow(`SELECT COUNT(*) FROM hosting_orders WHERE UPPER(voucher_code) = UPPER($1) AND user_id = $2 AND status IN ('pending', 'review', 'paid')`, code, userID).Scan(&n)
	return n, err
}

// claimVoucher checks the limits of a code once more, under the lock that makes orders with a voucher one at a time, so the
// last use of a code cannot go to two orders
func (m *Manager) claimVoucher(code string, userID int64) error {
	v, err := m.GetHostingVoucherByCode(code)
	if err != nil {
		return err
	}
	if v == nil || !v.Enabled {
		return ErrVoucherUnavailable
	}
	if v.MaxUses > 0 && v.Used >= v.MaxUses {
		return ErrVoucherUnavailable
	}
	if v.MaxPerAccount > 0 && userID > 0 {
		used, err := m.VoucherUsesByAccount(code, userID)
		if err != nil {
			return err
		}
		if used >= v.MaxPerAccount {
			return ErrVoucherUnavailable
		}
	}
	return nil
}

func nonNilInts(in []int64) []int64 {
	if in == nil {
		return []int64{}
	}
	return in
}
