// Package listquery filters, orders and counts the rows of a table the way a spreadsheet does: each column
// can be ordered and narrowed to a few of its values, and the values offered for a column are counted over
// the rows the other columns leave. It runs on the agent, over the whole list, so a filter or an order is
// the same however the list is paged or polled.
package listquery

import (
	"net/url"
	"sort"
	"strings"
)

const (
	// the most values one column may be narrowed to, and the longest one: the request is not trusted
	maxFilterValues = 64
	maxValueLength  = 200
	// a column with more distinct values than this offers only the most frequent ones
	maxFacetValues = 500
)

// Options is what a request asks for
type Options struct {
	// Query is a free text search over the whole row
	Query string
	// Sort is a column key, or "" for the order the rows came in
	Sort string
	Desc bool
	// Filters maps a column key to the values it is narrowed to (a row passes when its value is one of them)
	Filters map[string][]string
}

// Column describes one column of a table
type Column[T any] struct {
	Key string
	// Value is what the column shows as plain text: what a filter ticks and a facet counts
	Value func(T) string
	// Compare orders two rows by this column; nil compares Value without regard to case
	Compare func(a, b T) int
}

// Spec describes a table
type Spec[T any] struct {
	Columns []Column[T]
	// Search is the text a free search looks in; nil turns the search off
	Search func(T) string
	// Tiebreak orders rows that are equal in the sorted column; nil leaves them as they came
	Tiebreak func(a, b T) int
}

// Result is the rows to show and the values each column can be narrowed to
type Result[T any] struct {
	Items []T `json:"items"`
	// Total is how many rows pass every filter and the search; All is how many there were before
	Total int `json:"total"`
	All   int `json:"all"`
	// Facets maps a column key to value -> count, over the rows the other columns' filters leave
	Facets map[string]map[string]int `json:"facets"`
}

// Parse reads the request's query: q, sort, order, and one f.<column> per filtered column (repeat it for
// several values). Columns and values it does not know are dropped.
func Parse(q url.Values, keys []string) Options {
	opts := Options{Query: strings.TrimSpace(q.Get("q")), Filters: map[string][]string{}}
	known := make(map[string]bool, len(keys))
	for _, key := range keys {
		known[key] = true
	}
	if sortKey := strings.TrimSpace(q.Get("sort")); known[sortKey] {
		opts.Sort = sortKey
	}
	opts.Desc = strings.EqualFold(strings.TrimSpace(q.Get("order")), "desc")
	for _, key := range keys {
		values := q["f."+key]
		if len(values) == 0 {
			continue
		}
		if len(values) > maxFilterValues {
			values = values[:maxFilterValues]
		}
		kept := make([]string, 0, len(values))
		for _, value := range values {
			if len(value) <= maxValueLength {
				kept = append(kept, value)
			}
		}
		if len(kept) > 0 {
			opts.Filters[key] = kept
		}
	}
	return opts
}

// Keys lists the column keys of a spec
func (s Spec[T]) Keys() []string {
	keys := make([]string, len(s.Columns))
	for i, column := range s.Columns {
		keys[i] = column.Key
	}
	return keys
}

// Apply narrows, orders and counts the rows
func Apply[T any](items []T, spec Spec[T], opts Options) Result[T] {
	result := Result[T]{All: len(items), Facets: map[string]map[string]int{}}

	// the search first: every count below is over what it leaves
	searched := items
	if needle := strings.ToLower(opts.Query); needle != "" && spec.Search != nil {
		searched = make([]T, 0, len(items))
		for _, item := range items {
			if strings.Contains(strings.ToLower(spec.Search(item)), needle) {
				searched = append(searched, item)
			}
		}
	}

	allowed := make(map[string]map[string]bool, len(opts.Filters))
	for key, values := range opts.Filters {
		set := make(map[string]bool, len(values))
		for _, value := range values {
			set[value] = true
		}
		allowed[key] = set
	}
	passes := func(item T, skip string) bool {
		for _, column := range spec.Columns {
			if column.Key == skip {
				continue
			}
			if set, ok := allowed[column.Key]; ok && !set[column.Value(item)] {
				return false
			}
		}
		return true
	}

	// what each column offers: its values, counted over the rows the OTHER columns' filters leave, so ticking
	// one value never empties the list of another column's choices
	for _, column := range spec.Columns {
		counts := map[string]int{}
		for _, item := range searched {
			if passes(item, column.Key) {
				counts[column.Value(item)]++
			}
		}
		// a value that is ticked stays on offer even when nothing matches it now, so it can be unticked
		for value := range allowed[column.Key] {
			if _, ok := counts[value]; !ok {
				counts[value] = 0
			}
		}
		result.Facets[column.Key] = trimFacet(counts, allowed[column.Key])
	}

	rows := make([]T, 0, len(searched))
	for _, item := range searched {
		if passes(item, "") {
			rows = append(rows, item)
		}
	}
	if opts.Sort != "" {
		order(rows, spec, opts)
	}
	result.Items = rows
	result.Total = len(rows)
	return result
}

func order[T any](rows []T, spec Spec[T], opts Options) {
	var column *Column[T]
	for i := range spec.Columns {
		if spec.Columns[i].Key == opts.Sort {
			column = &spec.Columns[i]
			break
		}
	}
	if column == nil {
		return
	}
	compare := column.Compare
	if compare == nil {
		compare = func(a, b T) int {
			return strings.Compare(strings.ToLower(column.Value(a)), strings.ToLower(column.Value(b)))
		}
	}
	sort.SliceStable(rows, func(i, j int) bool {
		c := compare(rows[i], rows[j])
		if c == 0 {
			if spec.Tiebreak != nil {
				// ties keep one order whichever way the column runs, so rows never jump between polls
				return spec.Tiebreak(rows[i], rows[j]) < 0
			}
			return false
		}
		if opts.Desc {
			return c > 0
		}
		return c < 0
	})
}

// trimFacet keeps the most frequent values when a column has too many, never dropping a ticked one
func trimFacet(counts map[string]int, ticked map[string]bool) map[string]int {
	if len(counts) <= maxFacetValues {
		return counts
	}
	type kv struct {
		value string
		count int
	}
	list := make([]kv, 0, len(counts))
	for value, count := range counts {
		list = append(list, kv{value, count})
	}
	sort.Slice(list, func(i, j int) bool {
		if list[i].count != list[j].count {
			return list[i].count > list[j].count
		}
		return list[i].value < list[j].value
	})
	kept := make(map[string]int, maxFacetValues)
	for _, entry := range list {
		if len(kept) >= maxFacetValues && !ticked[entry.value] {
			continue
		}
		kept[entry.value] = entry.count
	}
	return kept
}
