package httpserver

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
)

const maxAIImages = 8

// aiImageRef is a picture the author attached to a prompt: the model is told where it is and what it is, so it can place it.
type aiImageRef struct {
	URL    string `json:"url"`
	Name   string `json:"name"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
}

// studioElementRef is the part of the page the author clicked in the preview before asking for a change.
type studioElementRef struct {
	Selector string `json:"selector"`
	HTML     string `json:"html"`
}

var aiImageURLRe = regexp.MustCompile(`^(/api/v1/public/doc-images/[a-f0-9]{40}\.(png|jpg|gif|webp)|https://[^\s"'<>()]{4,500})$`)

// cleanAIImages keeps only addresses of the panel image store or https, so nothing else can be written into a prompt or a page.
func cleanAIImages(in []aiImageRef) []aiImageRef {
	out := make([]aiImageRef, 0, len(in))
	for _, img := range in {
		img.URL = strings.TrimSpace(img.URL)
		if !aiImageURLRe.MatchString(img.URL) {
			continue
		}
		img.Name = clipText(strings.NewReplacer("\n", " ", "\r", " ", `"`, "'").Replace(strings.TrimSpace(img.Name)), 80)
		out = append(out, img)
		if len(out) == maxAIImages {
			break
		}
	}
	return out
}

func aiImageURLs(images []aiImageRef) []string {
	if len(images) == 0 {
		return nil
	}
	out := make([]string, len(images))
	for i, img := range images {
		out[i] = img.URL
	}
	return out
}

func clipText(s string, max int) string {
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max])
}

// aiImagesPrompt tells the model which pictures to place; asMarkdown is for articles, otherwise HTML.
func aiImagesPrompt(images []aiImageRef, asMarkdown bool) string {
	if len(images) == 0 {
		return ""
	}
	var b strings.Builder
	if asMarkdown {
		b.WriteString("\n\nImages attached by the author. Place EVERY one where it fits the text, each alone in its own paragraph as ![short caption](url), with the url copied exactly:\n")
	} else {
		b.WriteString("\n\nImages attached by the author. Use EVERY one in the page with <img>, the src copied exactly (a relative path is correct, do not add a domain), a meaningful alt, and responsive sizing:\n")
	}
	for i, img := range images {
		fmt.Fprintf(&b, "%d. url: %s", i+1, img.URL)
		if img.Name != "" {
			fmt.Fprintf(&b, " | file name: %q", img.Name)
		}
		if img.Width > 0 && img.Height > 0 {
			fmt.Fprintf(&b, " | size: %dx%d", img.Width, img.Height)
		}
		b.WriteString("\n")
	}
	return b.String()
}

func studioElementPrompt(el *studioElementRef) string {
	if el == nil || strings.TrimSpace(el.HTML) == "" {
		return ""
	}
	return fmt.Sprintf("\n\nThe user clicked this element in the preview; the instruction is about it. Change only this part unless the instruction clearly asks for more, and keep the rest of the document as it is.\nCSS path: %s\nElement:\n%s",
		clipText(el.Selector, 300), clipText(el.HTML, 4000))
}

// ensureCompleteHTML refuses a document the model could not finish: saving it would replace a working page with half of one.
func ensureCompleteHTML(code string) error {
	lower := strings.ToLower(code)
	if lower == "" || (!strings.Contains(lower, "<html") && !strings.Contains(lower, "<!doctype")) {
		return nil
	}
	if !strings.Contains(lower, "</html>") {
		return errors.New("jawaban AI terpotong sebelum halaman selesai, jadi tidak disimpan. Persingkat permintaan, minta perubahan per bagian, atau pakai model dengan batas keluaran lebih besar")
	}
	return nil
}
